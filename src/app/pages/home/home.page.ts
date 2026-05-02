import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import type { Unsubscribe } from '@firebase/firestore';
import { ConfirmService } from '../../services/confirm.service';


@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  isPatientMode = false;
  isProgressExpanded = false;

  
  userPhoto = '';
  userName = '';

  
  todayStats = {
    accuracy: 0,
    cardsToday: 0,
    avgTime: 0
  };

  toggleProgressDropdown() {
    this.isProgressExpanded = !this.isProgressExpanded;
  }

  
  private profileListener?: (e: any) => void;
  private sessionsUnsub?: Unsubscribe;
  private caregiverToggleListener?: (e: any) => void;

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isPatientMode = localStorage.getItem('patientMode') === 'true';
    this.loadUserProfile();
    this.loadTodayStats();
    this.attachRealtimeToday();

    
    this.profileListener = () => this.loadUserProfile();
    window.addEventListener('user-profile-updated', this.profileListener);

    this.caregiverToggleListener = () => this.onPatientModeToggle();
    window.addEventListener('caregiver-toggle', this.caregiverToggleListener);
    
    
    window.addEventListener('user-logged-in', (e: any) => {
      this.loadUserProfile();
      this.loadTodayStats();
    });
  }

  ngOnDestroy(): void {
    if (this.profileListener) {
      window.removeEventListener('user-profile-updated', this.profileListener);
    }
    if (this.caregiverToggleListener) {
      window.removeEventListener('caregiver-toggle', this.caregiverToggleListener);
    }
    try { this.sessionsUnsub?.(); } catch {}
  }

  ionViewWillEnter() {
    this.loadTodayStats();
    this.loadUserProfile();

    
    try {
      const pending = localStorage.getItem('pendingPatientMode') === 'true';
      if (pending && !this.isPatientMode) {
        // Directly enable patient mode without confirmation (already confirmed in Settings/Profile/Progress)
        this.activatePatientModeDirectly();
      }
      if (pending) {
        localStorage.removeItem('pendingPatientMode');
      }
    } catch {}
  }

  private activatePatientModeDirectly() {
    this.isPatientMode = true;
    localStorage.setItem('patientMode', 'true');
    void this.confirmService.notify('Patient Mode enabled');
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: true }));
  }

  async loadTodayStats() {
    try {
      
      const currentUser = this.firebaseService.getCurrentUser();
      if (!currentUser) {
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      
      const todaySessions = await this.getTodaySessions();

      if (todaySessions.length === 0) {
        this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
        return;
      }

      
      const totalQuestions = todaySessions.reduce((sum: number, s: any) => sum + s.totalQuestions, 0);
      const totalCorrect = todaySessions.reduce((sum: number, s: any) => sum + s.correctAnswers, 0);
      const totalTime = todaySessions.reduce((sum: number, s: any) => sum + s.totalTime, 0);

      this.todayStats = {
        accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        cardsToday: totalQuestions,
        avgTime: totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0
      };

      
    } catch (error) {
      console.error('Error loading today\'s stats:', error);
      this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
    }
  }

  private attachRealtimeToday() {
    try {
      this.sessionsUnsub?.();
      this.sessionsUnsub = this.firebaseService.subscribeToGameSessions((sessions) => {
        
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        const todaySessions = (sessions || []).filter((s: any) => {
          const t = new Date(s.timestamp);
          return t >= startOfDay && t <= endOfDay;
        });

        if (todaySessions.length === 0) {
          this.todayStats = { accuracy: 0, cardsToday: 0, avgTime: 0 };
          return;
        }
        const totalQuestions = todaySessions.reduce((sum: number, s: any) => sum + (s.totalQuestions || 0), 0);
        const totalCorrect  = todaySessions.reduce((sum: number, s: any) => sum + (s.correctAnswers || 0), 0);
        const totalTime     = todaySessions.reduce((sum: number, s: any) => sum + (s.totalTime || 0), 0);
        this.todayStats = {
          accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
          cardsToday: totalQuestions,
          avgTime: totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0
        };
      });
    } catch {}
  }

  async getTodaySessions() {
    try {
      const allSessions = await this.firebaseService.getUserGameSessions();

      
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const todaySessions = allSessions.filter((session: any) => {
        let sessionDate: Date;
        if (typeof session.timestamp === 'string') {
          sessionDate = new Date(session.timestamp);
        } else if (typeof session.timestamp === 'number') {
          sessionDate = new Date(session.timestamp);
        } else {
          return false;
        }

        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });

      return todaySessions;
    } catch (error) {
      console.error('Error getting today\'s sessions:', error);
      
      const uid = localStorage.getItem('userId');
      const key = uid ? `gameSessions:${uid}` : 'gameSessions';
      const sessions = localStorage.getItem(key);
      if (!sessions) return [];

      const allSessions = JSON.parse(sessions);
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      return allSessions.filter((session: any) => {
        const sessionDate = new Date(session.timestamp);
        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });
    }
  }

  
  private async loadUserProfile() {
    try {
      
      
      
      const userProfile = await this.firebaseService.getUserProfile();
      
      
      if (userProfile) {
        
        this.userName = userProfile.name || userProfile.patientInfo?.name || 'User';
        
        this.userPhoto = userProfile.photo ? `${userProfile.photo}?t=${Date.now()}` : '';
        
        
      } else {
        
        const user = this.firebaseService.getCurrentUser();
        this.userName = user?.displayName || 'Guest';
        this.userPhoto = '';
        
        
      }
      
      
      if (!this.userName || this.userName === 'Guest') {
        const raw = localStorage.getItem('userData');
        const data = raw ? JSON.parse(raw) : {};
        this.userName = data?.name || data?.caregiverInfo?.name || data?.patientInfo?.name || 'User';
        this.userPhoto = data?.photo ? `${data.photo}?t=${Date.now()}` : '';
        
        
      }
      
      
      this.cdr.detectChanges();
      
    } catch (e) {
      console.warn('Error loading user profile:', e);
      this.userPhoto = '';
      this.userName = 'User';
    }
  }

  
  async refreshData() {
    
    try {
      
      const loading = await this.loadingCtrl.create({
        message: 'Refreshing data...',
        duration: 1000
      });
      await loading.present();

      
      await Promise.all([
        this.loadUserProfile(),
        this.loadTodayStats()
      ]);

      await loading.dismiss();
      await this.confirmService.notify('Data refreshed successfully!', 'Saved');
      
    } catch (error) {
      console.error('Error refreshing data:', error);
      await this.confirmService.notify('Error refreshing data', 'Could not refresh');
    }
  }

  
  
  async enablePatientMode() {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      // If we somehow don't have a user, just send them to Settings
      // so they can configure caregiver options there.
      this.router.navigate(['/settings']).catch(err => {
        console.error('Navigation to settings failed from enablePatientMode:', err);
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

    
    const confirm = await this.alertCtrl.create({
      header: 'Enter Patient Mode?',
      message: 'Are you sure you want to switch to Patient Mode? You will need the caregiver password to exit.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Yes',
          handler: () => {
            this.isPatientMode = true;
            localStorage.setItem('patientMode', 'true');
            void this.confirmService.notify('Patient Mode enabled');
            window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: true }));
          }
        }
      ],
      backdropDismiss: false
    });
    await confirm.present();
  }

  
  async onPatientModeToggle() {
    if (!this.isPatientMode) {
      
      await this.enablePatientMode();
      return;
    }
    
    await this.promptExitPatientMode();
  }

  public async promptExitPatientMode() {
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
          handler: (data) => this.verifyAndExitPatientMode(data?.pin)
        }
      ],
      backdropDismiss: false
    });
    await alert.present();
  }

  private async verifyAndExitPatientMode(inputPin: string) {
    const currentUser = this.firebaseService.getCurrentUser();
    if (!currentUser) {
      // No user available – send them to Settings instead of showing an error toast.
      this.router.navigate(['/settings']).catch(err => {
        console.error('Navigation to settings failed from verifyAndExitPatientMode:', err);
      });
      return false;
    }

    const savedPin = await this.firebaseService.getCaregiverPassword(currentUser.uid);

    if (!savedPin) {
      const alert = await this.alertCtrl.create({
        header: 'No Password Set',
        message:
          'To exit Patient Mode, please set a caregiver password first in Settings.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Go to Settings',
            handler: () => this.router.navigate(['/settings'])
          }
        ]
      });
      await alert.present();
      return false;
    }

    if (!inputPin || inputPin !== savedPin) {
      await this.confirmService.notify('Incorrect password', 'Try again');
      return false;
    }

    this.isPatientMode = false;
    localStorage.setItem('patientMode', 'false');
    await this.confirmService.notify('Standard Mode enabled');
    
    window.dispatchEvent(new CustomEvent('patientMode-changed', { detail: false }));
    return true;
  }

  
  togglePatientMode() {
    if (!this.isPatientMode) {
      
      this.enablePatientMode();
    } else {
      this.promptExitPatientMode();
    }
  }


  
  navigateToGame(gameType: string) {
    switch (gameType) {
      case 'name-that-memory':
        this.router.navigate(['/brain-game-category', 'name-that-memory']);
        break;
      case 'category-match':
        this.router.navigate(['/brain-game-category', 'category-match']);
        break;
      case 'memory-matching':
        this.router.navigate(['/memory-matching']);
        break;
      case 'color-sequence':
        this.router.navigate(['/color-sequence']);
        break;
      default:
        
    }
  }

  // Toasts removed for defense UI consistency (use consistent modals instead).
}
