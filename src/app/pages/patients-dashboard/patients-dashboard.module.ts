import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PatientsDashboardPageRoutingModule } from './patients-dashboard-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { PatientsDashboardPage } from './patients-dashboard.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    PatientsDashboardPageRoutingModule
  ],
  declarations: [PatientsDashboardPage]
})
export class PatientsDashboardPageModule {}
