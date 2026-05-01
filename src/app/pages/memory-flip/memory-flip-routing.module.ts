import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MemoryFlipPage } from './memory-flip.page';

const routes: Routes = [
  {
    path: '',
    component: MemoryFlipPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MemoryFlipPageRoutingModule {}

