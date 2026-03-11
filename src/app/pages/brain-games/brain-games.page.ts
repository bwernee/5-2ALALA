import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-brain-games',
  templateUrl: './brain-games.page.html',
  styleUrls: ['./brain-games.page.scss'],
  standalone: false
})
export class BrainGamesPage implements OnInit {

  isPatientMode: boolean = false;

  constructor(private router: Router) {}

  ngOnInit() {
    this.loadPatientMode();
  }

  goBack() {
    this.router.navigate(['/home']);
  }

  loadPatientMode() {
    const savedMode = localStorage.getItem('patientMode');
    this.isPatientMode = savedMode === 'true';
  }

  onPatientModeToggle() {
    this.isPatientMode = !this.isPatientMode;
    localStorage.setItem('patientMode', this.isPatientMode.toString());
    
    
    if (this.isPatientMode) {
      this.router.navigate(['/home']);
    }
    
    
    window.dispatchEvent(new CustomEvent('patientModeChanged', { 
      detail: { isPatientMode: this.isPatientMode } 
    }));
  }
}
