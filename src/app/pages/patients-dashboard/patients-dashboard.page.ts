import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';

interface Patient {
  id: string;
  name?: string;
  photo?: string;
  age?: number;
  gender?: string;
  dateOfBirth?: string;
}

@Component({
  selector: 'app-patients-dashboard',
  templateUrl: './patients-dashboard.page.html',
  styleUrls: ['./patients-dashboard.page.scss'],
  standalone: false
})
export class PatientsDashboardPage implements OnInit, OnDestroy {
  patients: Patient[] = [];
  displayPatients: Patient[] = [];
  isLoading = false;
  private patientsUnsub?: Unsubscribe;

  // Inline add-patient form state
  showAddForm = false;
  newPatientFirstName = '';
  newPatientLastName = '';
  newPatientBirthday = '';
  newPatientSex = '';
  isSavingPatient = false;

  showFooter = true;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService
  ) {}

  ngOnInit() {
    const firstVisit = this.route.snapshot.queryParamMap.get('first') === '1';
    this.showFooter = !firstVisit;

    this.loadPatients();
    this.subscribeToPatients();
  }

  ngOnDestroy() {
    try {
      this.patientsUnsub?.();
    } catch {}
  }

  async loadPatients() {
    this.isLoading = true;
    try {
      const patientsList = await this.firebaseService.getPatients();
      console.log('Loaded patients:', patientsList);
      this.setPatients(patientsList);
      
      if (this.displayPatients.length === 0) {
        console.log('No patients found for this caregiver');
      }
    } catch (error: any) {
      console.error('Error loading patients:', error);
      await this.confirmService.confirm({
        title: 'Could not load',
        message: error.message || 'Failed to load patients.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      this.patients = [];
    } finally {
      this.isLoading = false;
    }
  }

  subscribeToPatients() {
    this.patientsUnsub = this.firebaseService.subscribeToPatients((patients) => {
      this.setPatients(patients);
    });
  }

  private setPatients(patients: Patient[]) {
    this.patients = patients || [];
    this.displayPatients = this.patients.filter(p => !!(p.name || '').toString().trim());
  }

  addPatient() {
    this.showAddForm = true;
  }

  cancelAddPatient() {
    if (this.isSavingPatient) return;
    void this.maybeDiscardAddPatient();
  }

  private hasAddPatientDraft(): boolean {
    return !!(
      (this.newPatientFirstName || '').trim() ||
      (this.newPatientLastName || '').trim() ||
      (this.newPatientBirthday || '').trim() ||
      (this.newPatientSex || '').trim()
    );
  }

  private async maybeDiscardAddPatient() {
    if (!this.hasAddPatientDraft()) {
      this.resetAddPatientForm();
      return;
    }
    const discard = await this.confirmService.confirm({
      title: 'Discard changes?',
      message: 'Are you sure you want to discard the patient details you entered?',
      confirmText: 'Yes',
      cancelText: 'No'
    });
    if (!discard) return;
    this.resetAddPatientForm();
  }

  private resetAddPatientForm() {
    this.showAddForm = false;
    this.newPatientFirstName = '';
    this.newPatientLastName = '';
    this.newPatientBirthday = '';
    this.newPatientSex = '';
  }

  async saveNewPatient() {
    const firstName = (this.newPatientFirstName ?? '').toString().trim();
    const lastName = (this.newPatientLastName ?? '').toString().trim();
    const dateOfBirth = (this.newPatientBirthday ?? '').toString().trim();
    const sex = (this.newPatientSex ?? '').toString().trim();

    if (!firstName) {
      await this.confirmService.notify('Please enter the patient\'s first name', 'Missing information');
      return;
    }

    if (!lastName) {
      await this.confirmService.notify('Please enter the patient\'s last name', 'Missing information');
      return;
    }

    if (!dateOfBirth) {
      await this.confirmService.notify('Please enter the patient\'s birthday', 'Missing information');
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

    this.isSavingPatient = true;

    try {
      const ok = await this.confirmService.confirm({
        title: 'Confirm Action',
        message: 'Are you sure you want to add this patient?',
        confirmText: 'Confirm',
        cancelText: 'Cancel'
      });
      if (!ok) return;

      const patientId = await this.firebaseService.addPatient({
        firstName,
        lastName,
        dateOfBirth,
        gender: sex
      });

      localStorage.setItem('selectedPatientId', patientId);
      await this.confirmService.confirm({
        title: 'Saved',
        message: 'Patient added successfully.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      this.resetAddPatientForm();
      
      // Force reload patients list to ensure it appears on mobile
      await this.loadPatients();
    } catch (error: any) {
      console.error('Error adding patient:', error);
      await this.confirmService.confirm({
        title: 'Could not save',
        message: error?.message || 'Failed to add patient. Please try again.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    } finally {
      this.isSavingPatient = false;
    }
  }

  selectPatient(patient: Patient) {
    if (!patient || !patient.id) {
      console.error('Invalid patient selected');
      return;
    }
    
    // Store selected patient ID and navigate to home
    localStorage.setItem('selectedPatientId', patient.id);
    console.log('Selected patient:', patient.id, patient.name);
    
    // Navigate to home page
    this.router.navigate(['/home']).then(() => {
      console.log('Navigated to home page');
    }).catch((error) => {
      console.error('Navigation error:', error);
      void this.confirmService.notify('Failed to navigate to home', 'Could not navigate');
    });
  }

  async onDeletePatientClicked(patient: Patient, ev: Event) {
    ev?.stopPropagation?.();
    if (!patient?.id) return;

    const ok = await this.confirmService.confirm({
      title: 'Confirm Action',
      message: `Are you sure you want to delete ${patient.name || 'this patient'}? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      await this.firebaseService.deletePatient(patient.id);
      await this.confirmService.confirm({
        title: 'Deleted',
        message: 'Patient deleted successfully.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      await this.loadPatients();
    } catch (error: any) {
      await this.confirmService.confirm({
        title: 'Could not delete',
        message: error?.message || 'Failed to delete patient.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    }
  }

  // Toasts removed for defense UI consistency (use consistent modals instead).

  getPatientInitials(patient: Patient): string {
    if (patient.name) {
      const names = patient.name.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[names.length - 1][0]).toUpperCase();
      }
      return patient.name.substring(0, 2).toUpperCase();
    }
    return 'P';
  }

  getPatientPhoto(patient: Patient): string {
    return patient.photo || '';
  }
}
