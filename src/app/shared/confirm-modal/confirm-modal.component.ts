import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';

export type ConfirmModalRole = 'confirm' | 'cancel';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.scss']
})
export class ConfirmModalComponent {
  @Input() title = 'Confirm Action';
  @Input() message = 'Are you sure you want to continue?';
  @Input() confirmText = 'Confirm';
  @Input() cancelText = 'Cancel';
  @Input() tone: 'default' | 'danger' = 'default';

  constructor(private modalCtrl: ModalController) {}

  cancel() {
    void this.modalCtrl.dismiss(false, 'cancel' satisfies ConfirmModalRole);
  }

  confirm() {
    void this.modalCtrl.dismiss(true, 'confirm' satisfies ConfirmModalRole);
  }
}

