import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { GlobalHeaderComponent } from './global-header/global-header.component';

@NgModule({
  imports: [CommonModule, IonicModule, GlobalHeaderComponent],
  exports: [GlobalHeaderComponent],
})
export class SharedModule {}
