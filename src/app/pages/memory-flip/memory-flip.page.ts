import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';
import { AlertController } from '@ionic/angular';

type Mode = 'easy' | 'medium';
type Screen = 'menu' | 'game' | 'result';

interface MemoryCard {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

@Component({
  selector: 'app-memory-flip',
  templateUrl: './memory-flip.page.html',
  styleUrls: ['./memory-flip.page.scss'],
  standalone: false,
})
export class MemoryFlipPage implements OnDestroy {
  screen: Screen = 'menu';
  selectedMode: Mode | null = null;

  cards: MemoryCard[] = [];
  flippedCards: number[] = [];
  matchedCards: number[] = [];
  moves = 0;
  isBusy = false;

  feedbackMessage = '';
  private feedbackTimeoutId: number | null = null;

  private roundStartedAtMs: number | null = null;

  private readonly emojiPool = ['⭐', '😊', '🍎', '🚗', '🏠', '🌙'];

  constructor(
    private router: Router,
    private firebaseService: FirebaseService,
    private alertCtrl: AlertController
  ) {}

  ngOnDestroy() {
    this.clearFeedback();
  }

  goBackToBrainGames() {
    this.router.navigate(['/brain-games']);
  }

  async onBackTapped() {
    // From the menu, go back to Brain Games.
    if (this.screen === 'menu') {
      this.goBackToBrainGames();
      return;
    }

    // While playing: ask confirmation, then go to Easy/Medium select.
    if (this.screen === 'game') {
      const alert = await this.alertCtrl.create({
        header: 'Leave this game?',
        message: 'Your current game will be reset. You can start again anytime 😊',
        buttons: [
          { text: 'Continue', role: 'cancel' },
          {
            text: 'Back to Level Select',
            handler: () => this.backToMenu(),
          },
        ],
      });
      await alert.present();
      return;
    }

    // Result screen: just go back to level select (no pressure).
    this.backToMenu();
  }

  selectMode(mode: Mode) {
    this.selectedMode = mode;
    this.startNewGame();
  }

  playAgain() {
    if (!this.selectedMode) {
      this.backToMenu();
      return;
    }
    this.startNewGame();
  }

  backToMenu() {
    this.screen = 'menu';
    this.selectedMode = null;
    this.cards = [];
    this.resetRoundState();
  }

  flipCard(cardIndex: number) {
    if (this.screen !== 'game') return;
    if (this.isBusy) return;
    if (this.flippedCards.length >= 2) return;

    const card = this.cards[cardIndex];
    if (!card || card.isFlipped || card.isMatched) return;

    card.isFlipped = true;
    this.flippedCards.push(cardIndex);

    if (this.flippedCards.length === 2) {
      this.moves++;
      this.checkMatch();
    }
  }

  get gridClass(): string {
    return this.selectedMode === 'medium' ? 'grid-medium' : 'grid-easy';
  }

  get modeTitle(): string {
    if (!this.selectedMode) return 'Memory Flip';
    return this.selectedMode === 'easy' ? 'Memory Flip (Easy)' : 'Memory Flip (Medium)';
  }

  private startNewGame() {
    if (!this.selectedMode) return;

    this.screen = 'game';
    this.resetRoundState();
    this.roundStartedAtMs = Date.now();

    const pairs = this.selectedMode === 'easy' ? 4 : 6;
    const emojis = this.emojiPool.slice(0, pairs);
    const deck = this.shuffle([...emojis, ...emojis]);

    this.cards = deck.map((emoji, idx) => ({
      id: idx,
      emoji,
      isFlipped: false,
      isMatched: false,
    }));
  }

  private checkMatch() {
    if (this.flippedCards.length !== 2) return;
    this.isBusy = true;

    const [aIndex, bIndex] = this.flippedCards;
    const a = this.cards[aIndex];
    const b = this.cards[bIndex];

    const isMatch = a?.emoji && b?.emoji && a.emoji === b.emoji;

    if (isMatch) {
      window.setTimeout(() => {
        a.isMatched = true;
        b.isMatched = true;
        this.matchedCards.push(aIndex, bIndex);
        this.flippedCards = [];
        // Keep calm pacing: allow the match "green" state to be seen.
        const isComplete = this.matchedCards.length === this.cards.length;
        if (isComplete) {
          // Stay busy during the short celebration pause.
          window.setTimeout(() => {
            this.finishGame();
          }, 900);
          return;
        }

        this.isBusy = false;

      }, 250);
      return;
    }

    this.setFeedback('Not a match 😊 Take your time', 1500);
    window.setTimeout(() => {
      a.isFlipped = false;
      b.isFlipped = false;
      this.flippedCards = [];
      this.isBusy = false;
      this.clearFeedback();
    }, 1500);
  }

  private async finishGame() {
    this.screen = 'result';
    this.isBusy = false;
    this.clearFeedback();

    const pairs = this.selectedMode === 'easy' ? 4 : 6;
    const totalCards = pairs * 2;
    const durationSeconds =
      this.roundStartedAtMs ? Math.max(0, Math.round((Date.now() - this.roundStartedAtMs) / 1000)) : 0;

    const sessionData = {
      category: 'memory-flip',
      mode: this.selectedMode,
      totalQuestions: pairs,
      correctAnswers: pairs,
      skipped: 0,
      totalTime: durationSeconds,
      moves: this.moves,
      totalCards,
      timestamp: Date.now(),
    };

    try {
      await ProgressPage.saveGameSession(this.firebaseService, sessionData as any);
    } catch (error) {
      console.error('Error saving Memory Flip session:', error);
    }
  }

  private resetRoundState() {
    this.moves = 0;
    this.flippedCards = [];
    this.matchedCards = [];
    this.isBusy = false;
    this.clearFeedback();
    this.roundStartedAtMs = null;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private setFeedback(message: string, clearAfterMs: number) {
    this.feedbackMessage = message;
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
    }
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimeoutId = null;
    }, clearAfterMs);
  }

  private clearFeedback() {
    this.feedbackMessage = '';
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }
  }
}

