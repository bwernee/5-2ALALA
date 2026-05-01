import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { FirebaseService } from '../../services/firebase.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AlertController } from '@ionic/angular';
import { calculateAge, formatFullName } from '../../utils/patient-utils';
import { ConfirmService } from '../../services/confirm.service';

interface CaregiverInfo {
  name: string;
  email: string;
  phone?: string;
}

interface PatientInfo {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  name?: string; // legacy fallback
  gender?: string;
  username?: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false
})
export class ProfilePage implements OnInit {
  
  caregiverInfo: CaregiverInfo | null = null;
  patientInfo: PatientInfo | null = null;
  accountCreated: Date | null = null;
  isPatientMode: boolean = false;
  patientId: string = '';
  private patientDocId: string = '';

  isEditingPatient = false;
  editFirstName = '';
  editLastName = '';
  editBirthday = '';
  editSex = '';
  isSavingPatient = false;

  constructor(
    private location: Location,
    private firebaseService: FirebaseService,
    private firestore: Firestore,
    private router: Router,
    private alertCtrl: AlertController,
    private confirmService: ConfirmService
  ) {}

  ngOnInit() {
    this.loadProfileData();
    this.loadPatientInfo();
    this.checkPatientMode();
  }

  goBack() {
    this.location.back();
  }

  async onPatientModeToggle() {
    if (!this.isPatientMode) {
      // Trying to enter patient mode
      await this.enablePatientMode();
      return;
    }
    // Already in patient mode - prompt to exit
    await this.promptExitPatientMode();
  }

  private async enablePatientMode() {
    try {
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        this.router.navigate(['/settings']).catch(err => {
          console.error('Navigation to settings failed from profile page:', err);
        });
        return;
      }

      const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

      if (!savedPin) {
        const alert = await this.alertCtrl.create({
          header: 'Set Caregiver Password',
          message:
            'To use Patient Mode, please create a caregiver password first. You will need it to exit Patient Mode.',
          cssClass: 'caregiver-password-alert',
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Go to Settings',
              handler: () => this.router.navigate(['/settings'])
            }
          ],
          backdropDismiss: false
        });
        await alert.present();
        return;
      }

      // Password exists - show confirmation
      const confirm = await this.alertCtrl.create({
        header: 'Enter Patient Mode?',
        message: 'Are you sure you want to switch to Patient Mode? You will need the caregiver password to exit.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Yes',
            handler: () => {
              // Set pending flag and navigate to home
              try { localStorage.setItem('pendingPatientMode', 'true'); } catch {}
              this.router.navigate(['/home']).catch(err => {
                console.error('Navigation to home failed from profile page:', err);
              });
            }
          }
        ],
        backdropDismiss: false
      });
      await confirm.present();
    } catch (err) {
      console.error('Error enabling patient mode from profile page:', err);
    }
  }

  private async promptExitPatientMode() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Exit Patient Mode',
      message: 'Enter caregiver password to switch back to Standard mode.',
      inputs: [
        {
          name: 'pin',
          type: 'password',
          placeholder: 'Enter password',
          attributes: { maxlength: 32 }
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Unlock',
          handler: async (data) => {
            const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);
            if (data.pin === savedPin) {
              this.isPatientMode = false;
              localStorage.setItem('patientMode', 'false');
              window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: false }));
              return true;
            }
            return false;
          }
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async loadProfileData() {
    try {
      
      const user = await this.firebaseService.getCurrentUser();
      if (user) {
        this.caregiverInfo = {
          name: user.displayName || 'Caregiver',
          email: user.email || 'No email provided',
          phone: user.phoneNumber || undefined
        };
        
        
        if (user.metadata?.creationTime) {
          this.accountCreated = new Date(user.metadata.creationTime);
        }
      }
    } catch (error) {
    }
  }

  private async loadPatientInfo() {
    try {
      const user = await this.firebaseService.getCurrentUser();
      if (!user) {
        console.error('No user found');
        return;
      }

      // Get the correct patient ID (selected patient or current user)
      const selectedPatientId = localStorage.getItem('selectedPatientId');
      const patientId = selectedPatientId || user.uid;
      this.patientDocId = patientId;
      
      // Set patient ID display (first 8 characters, uppercase)
      this.patientId = patientId.substring(0, 8).toUpperCase();

      // Try to load from localStorage first (for quick display)
      const storedPatientInfo = localStorage.getItem('patientDetails');
      if (storedPatientInfo && !selectedPatientId) {
        // Only use localStorage if we're viewing the current user's own patient info
        try {
          const parsed = JSON.parse(storedPatientInfo);
          this.patientInfo = {
            firstName: parsed.firstName || undefined,
            lastName: parsed.lastName || undefined,
            dateOfBirth: parsed.dateOfBirth || parsed.birthday || undefined,
            name: parsed.name || undefined,
            gender: parsed.sex || parsed.gender,
            username: parsed.username || undefined
          };
        } catch (e) {
          // If parsing fails, continue to load from Firestore
        }
      }

      // Load from Firestore (always fetch latest data)
      const cgId = user.uid;
      const patientDocRef = doc(this.firestore, 'caregiver', cgId, 'patients', patientId, 'patientInfo', 'details');
      const patientDoc = await getDoc(patientDocRef);
      
      if (patientDoc.exists()) {
        const patientData = patientDoc.data();
        this.patientInfo = {
          firstName: patientData['firstName'] || undefined,
          lastName: patientData['lastName'] || undefined,
          dateOfBirth: patientData['dateOfBirth'] || undefined,
          name: patientData['name'] || '',
          gender: patientData['sex'] || patientData['gender'] || '', 
          username: patientData['username'] || undefined
        };
        
        // Update localStorage only if viewing own patient info
        if (!selectedPatientId) {
          localStorage.setItem('patientDetails', JSON.stringify({
            firstName: this.patientInfo.firstName || '',
            lastName: this.patientInfo.lastName || '',
            dateOfBirth: this.patientInfo.dateOfBirth || '',
            name: this.getPatientDisplayName(),
            sex: this.patientInfo.gender || '',
            username: this.patientInfo.username
          }));
        }
      } else {
        // If no patient info found, try to get basic info from patient document
        const patientDocRef2 = doc(this.firestore, 'caregiver', cgId, 'patients', patientId);
        const patientDoc2 = await getDoc(patientDocRef2);
        
        if (patientDoc2.exists()) {
          const patientData2 = patientDoc2.data();
          this.patientInfo = {
            firstName: patientData2['firstName'] || undefined,
            lastName: patientData2['lastName'] || undefined,
            dateOfBirth: patientData2['dateOfBirth'] || undefined,
            name: patientData2['name'] || 'Patient Name',
            gender: patientData2['sex'] || patientData2['gender'] || '',
            username: patientData2['username'] || undefined
          };
        }
      }
    } catch (error) {
      console.error('Error loading patient info:', error);
    }
  }

  getPatientDisplayName(): string {
    const p = this.patientInfo || {};
    return (
      formatFullName(p.lastName, p.firstName) ||
      (p.name || '').toString().trim() ||
      'Patient Name'
    );
  }

  getPatientAgeLabel(): string {
    const age = calculateAge(this.patientInfo?.dateOfBirth || null);
    if (age === null) return '';
    return `${age} years old`;
  }

  startEditPatient() {
    if (!this.patientInfo) return;
    this.isEditingPatient = true;
    this.editFirstName = (this.patientInfo.firstName || '').toString();
    this.editLastName = (this.patientInfo.lastName || '').toString();
    this.editBirthday = (this.patientInfo.dateOfBirth || '').toString();
    this.editSex = (this.patientInfo.gender || '').toString();
  }

  cancelEditPatient() {
    if (this.isSavingPatient) return;
    void this.maybeDiscardEditPatient();
  }

  private hasEditDraft(): boolean {
    const fn = (this.editFirstName || '').trim();
    const ln = (this.editLastName || '').trim();
    const dob = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();
    const p = this.patientInfo || {};
    return (
      fn !== ((p.firstName || '').toString().trim()) ||
      ln !== ((p.lastName || '').toString().trim()) ||
      dob !== ((p.dateOfBirth || '').toString().trim()) ||
      sex !== ((p.gender || '').toString().trim())
    );
  }

  private async maybeDiscardEditPatient() {
    if (!this.hasEditDraft()) {
      this.isEditingPatient = false;
      return;
    }
    const discard = await this.confirmService.confirm({
      title: 'Discard changes?',
      message: 'Are you sure you want to discard your edits?',
      confirmText: 'Yes',
      cancelText: 'No'
    });
    if (!discard) return;
    this.isEditingPatient = false;
  }

  async saveEditedPatient() {
    if (this.isSavingPatient) return;
    const firstName = (this.editFirstName || '').trim();
    const lastName = (this.editLastName || '').trim();
    const dateOfBirth = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();

    if (!firstName) return;
    if (!lastName) return;
    if (!dateOfBirth) return;

    const ok = await this.confirmService.confirm({
      title: 'Confirm Action',
      message: 'Are you sure you want to save this patient data?',
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    this.isSavingPatient = true;
    try {
      await this.firebaseService.savePatientDetails(
        { firstName, lastName, dateOfBirth, sex },
        this.patientDocId
      );

      this.patientInfo = {
        ...(this.patientInfo || {}),
        firstName,
        lastName,
        dateOfBirth,
        gender: sex
      };

      // If viewing own patient info, keep local cache in sync for instant UI
      const selectedPatientId = localStorage.getItem('selectedPatientId');
      if (!selectedPatientId) {
        localStorage.setItem('patientDetails', JSON.stringify({
          firstName,
          lastName,
          dateOfBirth,
          name: `${lastName}, ${firstName}`,
          sex
        }));
      }

      this.isEditingPatient = false;
      await this.loadPatientInfo();

      await this.confirmService.confirm({
        title: 'Saved',
        message: 'Patient profile updated successfully.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    } catch (err: any) {
      console.error('Error saving edited patient:', err);
      await this.confirmService.confirm({
        title: 'Could not save',
        message: err?.message || 'Failed to save changes.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    } finally {
      this.isSavingPatient = false;
    }
  }

  private checkPatientMode() {
    
    const patientMode = localStorage.getItem('patientMode');
    this.isPatientMode = patientMode === 'true';
  }
}
