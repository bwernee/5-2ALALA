import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ConfirmService } from '../../services/confirm.service';
import { birthdayPopoverViewportEvent } from '../../utils/compact-birthday-popover.utils';
import {
  PATIENT_MIN_BIRTH_YMD,
  formatUsDateFromYmd,
  isoNoonFromYmd,
  normalizeDateOnlyFromIso,
  parseManualPatientBirthday,
  patientBirthdayForSave
} from '../../utils/patient-birthday.utils';

@Component({
  selector: 'app-patient-details',
  templateUrl: './patient-details.page.html',
  styleUrls: ['./patient-details.page.scss'],
  standalone: false
})
export class PatientDetailsPage implements OnInit {
  patientFirstName: string = '';
  patientLastName: string = '';
  patientNickname: string = '';
  /** ISO string for ion-datetime (e.g. 2001-05-15T12:00:00.000Z). */
  patientBirthday: string = '';
  /** Manual field: MM/DD/YYYY */
  birthdayDisplay: string = '';
  patientSex: string = '';
  isLoading: boolean = false;
  userId: string = '';
  birthdayPopoverOpen = false;
  birthdayPopoverEvent: Event | undefined;

  readonly maxBirthDate = new Date().toISOString();
  readonly minBirthDate = PATIENT_MIN_BIRTH_YMD;

  private get minBirthDateObj(): Date {
    return new Date(this.minBirthDate + 'T12:00:00.000Z');
  }

  private get maxBirthDateObj(): Date {
    return new Date(this.maxBirthDate);
  }

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

  openBirthdayPopover(ev: Event): void {
    const parsed = parseManualPatientBirthday(
      (this.birthdayDisplay || '').trim(),
      this.maxBirthDateObj,
      this.minBirthDateObj
    );
    if (parsed) {
      this.patientBirthday = isoNoonFromYmd(parsed);
    } else if (!this.patientBirthday) {
      this.patientBirthday = isoNoonFromYmd(
        normalizeDateOnlyFromIso(new Date().toISOString())
      );
    }
    this.birthdayPopoverEvent = birthdayPopoverViewportEvent(ev);
    this.birthdayPopoverOpen = true;
  }

  closeBirthdayPopover(): void {
    this.birthdayPopoverOpen = false;
  }

  confirmBirthdayPopover(): void {
    this.syncDisplayFromPicker();
    this.birthdayPopoverOpen = false;
  }

  onBirthdayPopoverDismiss(): void {
    this.birthdayPopoverOpen = false;
    this.birthdayPopoverEvent = undefined;
  }

  onBirthdayManualBlur(): void {
    const ymd = parseManualPatientBirthday(
      (this.birthdayDisplay || '').trim(),
      this.maxBirthDateObj,
      this.minBirthDateObj
    );
    if (ymd) {
      this.patientBirthday = isoNoonFromYmd(ymd);
      this.birthdayDisplay = formatUsDateFromYmd(ymd);
    }
  }

  private syncDisplayFromPicker(): void {
    const ymd = normalizeDateOnlyFromIso((this.patientBirthday || '').toString().trim());
    if (ymd.length >= 10) {
      this.birthdayDisplay = formatUsDateFromYmd(ymd.slice(0, 10));
    }
  }

  async savePatientDetails() {
    const firstName = (this.patientFirstName || '').trim();
    const lastName = (this.patientLastName || '').trim();
    const dateOfBirth = patientBirthdayForSave(
      this.birthdayDisplay,
      this.patientBirthday,
      this.maxBirthDateObj,
      this.minBirthDateObj
    );
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
        message: 'Please enter a valid birthday (MM/DD/YYYY) or pick a date from the calendar.',
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

    const nickname = (this.patientNickname || '').trim();
    if (!nickname) {
      await this.confirmService.confirm({
        title: 'Missing information',
        message: 'Please enter a display name (shown on My Patients).',
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
        nickname,
        name: `${lastName}, ${firstName}`,
        dateOfBirth,
        sex: sex
      };

      await this.firebaseService.savePatientDetails({
        firstName,
        lastName,
        dateOfBirth,
        sex,
        nickname
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
      (this.patientNickname || '').trim() ||
      (this.birthdayDisplay || '').trim() ||
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
