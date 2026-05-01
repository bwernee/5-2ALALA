import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-patient-details',
  templateUrl: './patient-details.page.html',
  styleUrls: ['./patient-details.page.scss'],
  standalone: false
})
export class PatientDetailsPage implements OnInit {
  patientFirstName: string = '';
  patientLastName: string = '';
  patientBirthday: string = '';
  patientSex: string = '';
  isLoading: boolean = false;
  userId: string = '';

  constructor(
    private router: Router,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService
  ) {}

  ngOnInit() {
    
    this.userId = localStorage.getItem('userId') || '';
    if (!this.userId) {
      alert('User ID not found. Please sign up again.');
      this.router.navigate(['/signup']);
    }
  }

  async savePatientDetails() {
    
    const firstName = (this.patientFirstName || '').trim();
    const lastName = (this.patientLastName || '').trim();
    const dateOfBirth = (this.patientBirthday || '').toString().trim();
    const sex = (this.patientSex || '').trim();

    
    if (!firstName) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please enter the patient’s first name.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      return;
    }

    if (!lastName) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please enter the patient’s last name.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      return;
    }

    if (!dateOfBirth) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please select the patient’s birthday.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      return;
    }

    if (!sex) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please select the patient’s sex.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      return;
    }

    this.isLoading = true;

    try {
      const ok = await this.confirmService.confirm({
        title: 'Confirm Action',
        message: 'Are you sure you want to save this patient data?',
        confirmText: 'Confirm',
        cancelText: 'Cancel'
      });
      if (!ok) return;

      
      const patientDetails = {
        firstName,
        lastName,
        name: `${lastName}, ${firstName}`,
        dateOfBirth,
        sex: sex
      };

      
      await this.firebaseService.savePatientDetails({
        firstName,
        lastName,
        dateOfBirth,
        sex
      });

      
      localStorage.setItem('patientDetails', JSON.stringify(patientDetails));

      
      this.router.navigate(['/home']);

    } catch (error: any) {
      console.error('Error saving patient details:', error);
      await this.confirmService.confirm({
        title: 'Could not save',
        message: error.message || 'Failed to save patient details. Please try again.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    } finally {
      this.isLoading = false;
    }
  }

  private hasDraft(): boolean {
    return !!(
      (this.patientFirstName || '').trim() ||
      (this.patientLastName || '').trim() ||
      (this.patientBirthday || '').trim() ||
      (this.patientSex || '').trim()
    );
  }

  async onBackTapped() {
    if (this.isLoading) return;
    if (!this.hasDraft()) {
      this.router.navigate(['/signup']);
      return;
    }
    const discard = await this.confirmService.confirm({
      title: 'Discard changes?',
      message: 'Are you sure you want to discard the patient details you entered?',
      confirmText: 'Yes',
      cancelText: 'No'
    });
    if (!discard) return;
    this.router.navigate(['/signup']);
  }

  goBack() {
    void this.onBackTapped();
  }
}

