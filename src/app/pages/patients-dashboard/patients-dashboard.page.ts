import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import type { Unsubscribe } from '@firebase/firestore';

interface Patient {
  id: string;
  name?: string;
  photo?: string;
  age?: number;
  gender?: string;
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
  newPatientName = '';
  newPatientAge = '';
  newPatientSex = '';
  isSavingPatient = false;

  showFooter = true;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService
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
      this.presentToast(error.message || 'Failed to load patients', 'danger');
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
    this.showAddForm = false;
    this.newPatientName = '';
    this.newPatientAge = '';
    this.newPatientSex = '';
  }

  async saveNewPatient() {
    const name = (this.newPatientName ?? '').toString().trim();
    const ageStr = (this.newPatientAge ?? '').toString().trim();
    const sex = (this.newPatientSex ?? '').toString().trim();

    if (!name) {
      this.presentToast('Please enter the patient\'s name', 'danger');
      return;
    }

    if (!ageStr) {
      this.presentToast('Please enter the patient\'s age', 'danger');
      return;
    }

    const ageNum = parseInt(ageStr, 10);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
      this.presentToast('Please enter a valid age (0-150)', 'danger');
      return;
    }

    if (!sex) {
      this.presentToast('Please select the patient\'s sex', 'danger');
      return;
    }

    this.isSavingPatient = true;

    try {
      const patientId = await this.firebaseService.addPatient({
        name,
        age: ageNum,
        gender: sex
      });

      localStorage.setItem('selectedPatientId', patientId);
      this.presentToast('Patient added successfully', 'success');
      this.showAddForm = false;
      this.newPatientName = '';
      this.newPatientAge = '';
      this.newPatientSex = '';
    } catch (error: any) {
      console.error('Error adding patient:', error);
      this.presentToast(error?.message || 'Failed to add patient', 'danger');
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
      this.presentToast('Failed to navigate to home', 'danger');
    });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

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
