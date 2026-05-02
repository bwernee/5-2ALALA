import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { contactNumberToAuthEmail } from '../../utils/auth-email.utils';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: false
})
export class SignupPage {
  lastName: string = '';
  firstName: string = '';
  phoneNumber: string = '';
  password: string = '';
  confirmPassword: string = '';
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) {}

  async signup() {
    const lastName = (this.lastName || '').trim();
    const firstName = (this.firstName || '').trim();
    const phoneNumber = (this.phoneNumber || '').trim();
    const password = this.password || '';
    const confirmPassword = this.confirmPassword || '';

    if (!lastName) {
      alert('Please enter your last name');
      return;
    }
    if (!firstName) {
      alert('Please enter your first name');
      return;
    }
    if (!phoneNumber) {
      alert('Please enter your contact number');
      return;
    }
    if (!password) {
      alert('Please enter a password');
      return;
    }
    if (!confirmPassword) {
      alert('Please confirm your password');
      return;
    }

    const phoneDigitsOnly = phoneNumber.replace(/\D/g, '');
    if (phoneDigitsOnly.length < 10) {
      alert('Please enter a valid contact number (at least 10 digits)');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    const email = contactNumberToAuthEmail(phoneNumber);
    const displayName = `${lastName}, ${firstName}`;

    this.isLoading = true;

    try {
      const user = await this.firebaseService.signup(email, password, displayName, phoneNumber, {
        firstName,
        lastName
      });

      const userData = {
        firstName,
        lastName,
        name: displayName,
        email,
        phoneNumber,
        createdAt: new Date().toISOString()
      };

      localStorage.setItem('userData', JSON.stringify(userData));
      localStorage.setItem('userLoggedIn', 'true');
      localStorage.setItem('userEmail', email);
      localStorage.setItem('userId', user.uid);

      try {
        localStorage.removeItem('patientDetails');
        ['peopleCards', 'placesCards', 'objectsCards'].forEach(k => localStorage.removeItem(k));
        ['peopleCards_' + user.uid, 'placesCards_' + user.uid, 'objectsCards_' + user.uid].forEach(k =>
          localStorage.removeItem(k)
        );
      } catch {}

      this.router.navigate(['/patients-dashboard'], {
        queryParams: { first: '1' }
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        alert('This contact number is already registered. Please log in.');
      } else if (code === 'auth/weak-password') {
        alert('Password is too weak. Please use a stronger password.');
      } else if (code === 'auth/invalid-email') {
        alert('Invalid contact number format. Please try again.');
      } else if (error?.message?.includes('Missing or insufficient permissions')) {
        alert('Permission denied. Firestore rules may not be configured correctly. Please contact support.');
      } else {
        alert(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToLanding() {
    this.router.navigate(['/']);
  }
}
