import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';
import { MediaService } from '../../services/media.service';
import { birthdayPopoverViewportEvent } from '../../utils/compact-birthday-popover.utils';
import {
  PATIENT_MIN_BIRTH_YMD,
  formatUsDateFromYmd,
  isoNoonFromYmd,
  normalizeDateOnlyFromIso,
  parseManualPatientBirthday,
  patientBirthdayForSave
} from '../../utils/patient-birthday.utils';

interface Patient {
  id: string;
  name?: string;
  nickname?: string;
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
  newPatientNickname = '';
  /** ISO for ion-datetime */
  newPatientBirthday = '';
  /** MM/DD/YYYY manual entry */
  newPatientBirthdayDisplay = '';
  newPatientBirthdayPopoverOpen = false;
  newPatientBirthdayPopoverEvent: Event | undefined;
  newPatientSex = '';
  isSavingPatient = false;

  readonly newPatientMaxBirth = new Date().toISOString();
  readonly newPatientMinBirth = PATIENT_MIN_BIRTH_YMD;

  private get newPatientMaxBirthDate(): Date {
    return new Date(this.newPatientMaxBirth);
  }

  private get newPatientMinBirthDate(): Date {
    return new Date(this.newPatientMinBirth + 'T12:00:00.000Z');
  }

  showFooter = true;

  patientSearch = '';
  genderFilter: 'all' | 'Male' | 'Female' = 'all';
  showGenderFilters = false;
  private patientPhotoUploadBusy = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private mediaService: MediaService
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

  get filteredPatients(): Patient[] {
    let list = this.displayPatients;
    const q = (this.patientSearch || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q)
      );
    }
    if (this.genderFilter !== 'all') {
      list = list.filter((p) => (p.gender || '').toLowerCase() === this.genderFilter.toLowerCase());
    }
    return list;
  }

  get previewPatient(): Patient | null {
    return this.filteredPatients.length ? this.filteredPatients[0] : null;
  }

  trackByPatientId(_i: number, p: Patient): string {
    return p.id;
  }

  toggleGenderFilters(): void {
    this.showGenderFilters = !this.showGenderFilters;
  }

  setGenderFilter(v: 'Male' | 'Female'): void {
    if (this.genderFilter === v) {
      this.genderFilter = 'all';
    } else {
      this.genderFilter = v;
    }
  }

  /** Primary list title: display name (nickname), required for new patients; legacy may fall back to legal name. */
  getPatientDisplayName(p: Patient): string {
    const nick = (p.nickname || '').trim();
    if (nick) return nick;
    return (p.name || '').trim() || 'Patient';
  }

  /** Second line: legal name when display name is the nickname. */
  getPatientLegalLine(p: Patient): string | null {
    const legal = (p.name || '').trim();
    if (!legal) return null;
    if ((p.nickname || '').trim()) return legal;
    return null;
  }

  genderIconName(patient: Patient): string {
    const g = (patient.gender || '').toLowerCase();
    if (g === 'male' || g === 'm') return 'male-outline';
    if (g === 'female' || g === 'f') return 'female-outline';
    return 'male-female-outline';
  }

  getPatientPhoto(patient: Patient): string {
    return (patient.photo || '').trim();
  }

  onPatientAvatarClick(patient: Patient, ev: Event): void {
    ev.stopPropagation();
    void this.pickAndSavePatientPhoto(patient);
  }

  private pickPhotoViaFileInput(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      let settled = false;
      const finish = (v: string | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onRefocus, true);
        input.remove();
        resolve(v);
      };

      const onRefocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 500);
      };
      window.addEventListener('focus', onRefocus, true);

      input.onchange = () => {
        window.removeEventListener('focus', onRefocus, true);
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => finish(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => finish(null);
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }

  private async pickAndSavePatientPhoto(patient: Patient): Promise<void> {
    if (!patient?.id || this.patientPhotoUploadBusy) return;

    let dataUrl: string | null = null;
    try {
      dataUrl = await this.mediaService.chooseFromGallery();
    } catch {
      dataUrl = await this.pickPhotoViaFileInput();
    }

    if (!dataUrl) return;

    this.patientPhotoUploadBusy = true;
    const loading = await this.loadingCtrl.create({ message: 'Saving photo…' });
    await loading.present();
    try {
      await this.firebaseService.updatePatientProfilePhoto(patient.id, dataUrl);
    } catch (error: any) {
      await this.confirmService.confirm({
        title: 'Could not save photo',
        message: error?.message || 'Failed to upload profile photo.',
        confirmText: 'OK',
        cancelText: 'Close'
      });
    } finally {
      this.patientPhotoUploadBusy = false;
      await loading.dismiss();
    }
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
      (this.newPatientNickname || '').trim() ||
      (this.newPatientBirthdayDisplay || '').trim() ||
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
    this.newPatientNickname = '';
    this.newPatientBirthday = '';
    this.newPatientBirthdayDisplay = '';
    this.newPatientBirthdayPopoverOpen = false;
    this.newPatientBirthdayPopoverEvent = undefined;
    this.newPatientSex = '';
  }

  openNewPatientBirthdayPopover(ev: Event): void {
    const parsed = parseManualPatientBirthday(
      (this.newPatientBirthdayDisplay || '').trim(),
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
    if (parsed) {
      this.newPatientBirthday = isoNoonFromYmd(parsed);
    } else if (!this.newPatientBirthday) {
      this.newPatientBirthday = isoNoonFromYmd(
        normalizeDateOnlyFromIso(new Date().toISOString())
      );
    }
    this.newPatientBirthdayPopoverEvent = birthdayPopoverViewportEvent(ev);
    this.newPatientBirthdayPopoverOpen = true;
  }

  closeNewPatientBirthdayPopover(): void {
    this.newPatientBirthdayPopoverOpen = false;
  }

  confirmNewPatientBirthdayPopover(): void {
    const ymd = normalizeDateOnlyFromIso((this.newPatientBirthday || '').toString().trim());
    if (ymd.length >= 10) {
      this.newPatientBirthdayDisplay = formatUsDateFromYmd(ymd.slice(0, 10));
    }
    this.newPatientBirthdayPopoverOpen = false;
  }

  onNewPatientBirthdayPopoverDismiss(): void {
    this.newPatientBirthdayPopoverOpen = false;
    this.newPatientBirthdayPopoverEvent = undefined;
  }

  onNewPatientBirthdayBlur(): void {
    const ymd = parseManualPatientBirthday(
      (this.newPatientBirthdayDisplay || '').trim(),
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
    if (ymd) {
      this.newPatientBirthday = isoNoonFromYmd(ymd);
      this.newPatientBirthdayDisplay = formatUsDateFromYmd(ymd);
    }
  }

  async saveNewPatient() {
    const firstName = (this.newPatientFirstName ?? '').toString().trim();
    const lastName = (this.newPatientLastName ?? '').toString().trim();
    const dateOfBirth = patientBirthdayForSave(
      this.newPatientBirthdayDisplay,
      this.newPatientBirthday,
      this.newPatientMaxBirthDate,
      this.newPatientMinBirthDate
    );
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
      await this.confirmService.notify(
        'Please enter a valid birthday (MM/DD/YYYY) or pick a date from the calendar.',
        'Missing information'
      );
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

    const nickname = (this.newPatientNickname || '').trim();
    if (!nickname) {
      await this.confirmService.notify('Please enter a display name.', 'Missing information');
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
        gender: sex,
        nickname
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
      message: `Are you sure you want to delete ${this.getPatientDisplayName(patient)}? This cannot be undone.`,
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
}
