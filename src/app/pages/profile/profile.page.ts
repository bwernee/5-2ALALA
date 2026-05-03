import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { FirebaseService } from '../../services/firebase.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AlertController, ViewWillEnter } from '@ionic/angular';
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
  nickname?: string;
  gender?: string;
  username?: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false
})
export class ProfilePage implements OnInit, ViewWillEnter {
  
  caregiverInfo: CaregiverInfo | null = null;
  patientInfo: PatientInfo | null = null;
  accountCreated: Date | null = null;
  isPatientMode: boolean = false;
  patientId: string = '';
  private patientDocId: string = '';

  isEditingPatient = false;
  editNickname = '';
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
    void this.refreshProfileScreen();
    this.checkPatientMode();
  }

  ionViewWillEnter() {
    void this.refreshProfileScreen();
    this.checkPatientMode();
  }

  private async refreshProfileScreen() {
    await this.loadProfileData();
    await this.loadPatientInfo();
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
      const user = this.firebaseService.getCurrentUser();
      if (!user) {
        this.caregiverInfo = null;
        return;
      }

      const profile = await this.firebaseService.getUserProfile(user.uid);
      const rootName = (profile?.name || '').trim();
      const rootEmail = (profile?.email || user.email || '').trim();
      const docPhone = (
        (profile as unknown as { phoneNumber?: string })?.phoneNumber || ''
      ).trim();
      const nested = profile?.caregiverInfo;

      let name =
        (nested?.name || '').trim() ||
        rootName ||
        (user.displayName || '').trim() ||
        this.nameFromUserDataLocal() ||
        'Caregiver';
      let email =
        (nested?.contactEmail || '').trim() ||
        rootEmail ||
        (user.email || '').trim() ||
        this.emailFromUserDataLocal() ||
        '';
      let phone =
        (nested?.contactPhone || '').trim() ||
        docPhone ||
        (user.phoneNumber || '').trim() ||
        this.phoneFromUserDataLocal() ||
        undefined;

      if (!email) email = 'No email provided';

      this.caregiverInfo = {
        name,
        email,
        phone: phone || undefined
      };

      if (user.metadata?.creationTime) {
        this.accountCreated = new Date(user.metadata.creationTime);
      } else if (profile?.createdAt) {
        this.accountCreated = new Date(profile.createdAt);
      }
    } catch {
      const user = this.firebaseService.getCurrentUser();
      if (user) {
        this.caregiverInfo = {
          name: user.displayName || this.nameFromUserDataLocal() || 'Caregiver',
          email: user.email || this.emailFromUserDataLocal() || 'No email provided',
          phone: user.phoneNumber || this.phoneFromUserDataLocal() || undefined
        };
      }
    }
  }

  private nameFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      const u = JSON.parse(raw) as { name?: string; firstName?: string; lastName?: string };
      const n = (u.name || '').trim();
      if (n) return n;
      return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    } catch {
      return '';
    }
  }

  private emailFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      return ((JSON.parse(raw) as { email?: string }).email || '').trim();
    } catch {
      return '';
    }
  }

  private phoneFromUserDataLocal(): string {
    try {
      const raw = localStorage.getItem('userData');
      if (!raw) return '';
      return ((JSON.parse(raw) as { phoneNumber?: string }).phoneNumber || '').trim();
    } catch {
      return '';
    }
  }

  private async loadPatientInfo() {
    try {
      const user = this.firebaseService.getCurrentUser();
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
            nickname: parsed.nickname || undefined,
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
          nickname: patientData['nickname'] || undefined,
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
            nickname: this.patientInfo.nickname || '',
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
            nickname: patientData2['nickname'] || undefined,
            gender: patientData2['sex'] || patientData2['gender'] || '',
            username: patientData2['username'] || undefined
          };
        }
      }

      await this.hydratePatientFromCaregiverAccount(user.uid, patientId, selectedPatientId);
    } catch (error) {
      console.error('Error loading patient info:', error);
    }
  }

  /**
   * Signup stores caregiver first/last name on `caregiver/{uid}` but often not under
   * `patients/{uid}/patientInfo/details` until Edit Profile saves. Fill the patient card
   * from that account doc when viewing your own default patient.
   */
  private async hydratePatientFromCaregiverAccount(
    caregiverUid: string,
    patientId: string,
    selectedPatientId: string | null
  ) {
    const isOwnDefaultPatient = !selectedPatientId || selectedPatientId === caregiverUid;
    if (!isOwnDefaultPatient) return;

    const profile = await this.firebaseService.getUserProfile(caregiverUid);
    if (!profile) return;

    const p = this.patientInfo;
    const hasPatientSubdoc =
      !!p &&
      !!(
        (p.firstName || '').trim() ||
        (p.lastName || '').trim() ||
        (p.dateOfBirth || '').trim() ||
        (p.nickname || '').trim() ||
        ((p.name || '').trim() && (p.name || '').trim() !== 'Patient Name')
      );

    if (hasPatientSubdoc) return;

    const nested = profile.patientInfo;
    const next: PatientInfo = { ...(p || {}) };

    if (nested) {
      next.dateOfBirth = next.dateOfBirth || nested.dateOfBirth;
      next.gender = next.gender || nested.gender;
      next.name = (next.name || nested.name || '').trim() || undefined;
      next.nickname = (next.nickname || nested.name || '').trim() || undefined;
      if (!(next.firstName || '').trim() && !(next.lastName || '').trim() && nested.name) {
        const parts = nested.name.trim().split(/\s+/);
        if (parts.length >= 2) {
          next.firstName = parts[0];
          next.lastName = parts.slice(1).join(' ');
        } else {
          next.firstName = nested.name.trim();
        }
      }
    }

    next.firstName = (next.firstName || profile.firstName || '').trim() || undefined;
    next.lastName = (next.lastName || profile.lastName || '').trim() || undefined;
    next.dateOfBirth = next.dateOfBirth || profile.dateOfBirth;
    next.name =
      (next.name || profile.name || formatFullName(profile.lastName, profile.firstName) || '').trim() ||
      undefined;

    if (!(next.nickname || '').trim()) {
      const friendly = [next.firstName, next.lastName].filter(Boolean).join(' ').trim();
      if (friendly) next.nickname = friendly;
      else if (next.name) next.nickname = next.name.replace(/^([^,]+),\s*(.+)$/, '$2 $1').trim() || next.name;
    }

    const hasAnything =
      (next.firstName || '').trim() ||
      (next.lastName || '').trim() ||
      (next.dateOfBirth || '').trim() ||
      (next.nickname || '').trim() ||
      (next.name || '').trim() ||
      (next.gender || '').trim();

    if (hasAnything) {
      this.patientInfo = next;
    }
  }

  /** Hide “empty” placeholder when we already show real name / fields from account or Firestore. */
  showPatientInfoPlaceholder(): boolean {
    const p = this.patientInfo;
    if (!p) return true;
    if ((p.dateOfBirth || '').trim()) return false;
    if ((p.gender || '').trim()) return false;
    if ((p.username || '').trim()) return false;
    if ((p.firstName || '').trim() || (p.lastName || '').trim()) return false;
    if ((p.nickname || '').trim()) return false;
    const legal = formatFullName(p.lastName, p.firstName) || (p.name || '').toString().trim();
    if (legal && legal !== 'Patient Name') return false;
    const disp = this.getPatientDisplayName();
    return !disp || disp === 'Patient Name';
  }

  getPatientDisplayName(): string {
    const p = this.patientInfo || {};
    const nick = (p.nickname || '').trim();
    if (nick) return nick;
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
    if (this.isPatientMode) return;
    this.isEditingPatient = true;
    const p = this.patientInfo;
    this.editNickname = (p?.nickname || '').toString();
    this.editFirstName = (p?.firstName || '').toString();
    this.editLastName = (p?.lastName || '').toString();
    this.editBirthday = (p?.dateOfBirth || '').toString();
    let sex = (p?.gender || '').toString();
    if (sex === 'Other') sex = '';
    this.editSex = sex;
    if (!this.editNickname.trim()) {
      const guess = `${this.editFirstName} ${this.editLastName}`.trim();
      if (guess) this.editNickname = guess;
    }
  }

  cancelEditPatient() {
    if (this.isSavingPatient) return;
    void this.maybeDiscardEditPatient();
  }

  private hasEditDraft(): boolean {
    const nick = (this.editNickname || '').trim();
    const fn = (this.editFirstName || '').trim();
    const ln = (this.editLastName || '').trim();
    const dob = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();
    const p = this.patientInfo || {};
    return (
      nick !== ((p.nickname || '').toString().trim()) ||
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
    let nickname = (this.editNickname || '').trim();
    const firstName = (this.editFirstName || '').trim();
    const lastName = (this.editLastName || '').trim();
    const dateOfBirth = (this.editBirthday || '').trim();
    const sex = (this.editSex || '').trim();

    if (!nickname) nickname = `${firstName} ${lastName}`.trim();
    if (!nickname) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please enter a display name (or first and last name).',
        confirmText: 'OK',
        cancelText: 'Close'
      });
      return;
    }
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
        { firstName, lastName, dateOfBirth, sex, nickname },
        this.patientDocId
      );

      this.patientInfo = {
        ...(this.patientInfo || {}),
        nickname,
        firstName,
        lastName,
        dateOfBirth,
        name: `${lastName}, ${firstName}`,
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
          nickname,
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
