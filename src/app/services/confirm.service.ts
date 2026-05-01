import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { ConfirmModalComponent } from '../shared/confirm-modal/confirm-modal.component';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private modalCtrl: ModalController) {}

  async confirm(opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: 'default' | 'danger';
  }): Promise<boolean> {
    const modal = await this.modalCtrl.create({
      component: ConfirmModalComponent,
      cssClass: 'app-confirm-modal',
      backdropDismiss: false,
      componentProps: {
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        tone: opts.tone || 'default'
      }
    });

    await modal.present();
    const result = await modal.onWillDismiss<boolean>();
    return !!result.data;
  }

  async notify(message: string, title = 'Notice'): Promise<void> {
    await this.confirm({
      title,
      message,
      confirmText: 'OK',
      cancelText: 'Close'
    });
  }
}

