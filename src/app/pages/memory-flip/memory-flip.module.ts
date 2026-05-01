import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MemoryFlipPageRoutingModule } from './memory-flip-routing.module';
import { SharedModule } from '../../shared/shared.module';

import { MemoryFlipPage } from './memory-flip.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    MemoryFlipPageRoutingModule,
  ],
  declarations: [MemoryFlipPage],
})
export class MemoryFlipPageModule {}

