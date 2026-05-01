import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { FirebaseService } from '../../services/firebase.service';
import { ProgressPage } from '../progress/progress.page';

type Phase = 'study' | 'distraction' | 'recall' | 'result';
type DistractionType = 'color' | 'tap-emoji' | 'tap-fruits' | 'tap-among-3';

interface RecallCard {
  id: number;
  emoji: string;
  isSelected: boolean;
  isCorrect?: boolean;
}

@Component({
  selector: 'app-memory-recall-challenge',
  templateUrl: './memory-recall-challenge.page.html',
  styleUrls: ['./memory-recall-challenge.page.scss'],
  standalone: false,
})
export class MemoryRecallChallengePage implements OnDestroy {
  phase: Phase = 'study';

  // State variables (as requested)
  studyCards: string[] = [];
  recallCards: RecallCard[] = [];
  selectedAnswers: number[] = [];

  score = 0;
  falseSelections = 0;

  isBusy = false;
  feedbackMessage = '';

  private readonly emojiPool = ['⭐', '😊', '🍎', '🚗', '🏠', '🌙'];
  private feedbackTimeoutId: number | null = null;
  private sessionStartedAtMs: number | null = null;

  // Distraction phase (calm, no pressure, varied)
  distractionType: DistractionType = 'color';
  distractionPrompt = '';
  distractionCompleted = false;
  private lastDistractionType: DistractionType | null = null;

  // Distraction: choose correct color
  colorTarget: 'purple' | 'blue' = 'purple';

  // Distraction: tap matching emojis / tap all fruits
  distractionCards: RecallCard[] = [];
  distractionTargetEmoji = '';
  distractionTargetSet: string[] = [];

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseService
  ) {}

  ngOnDestroy() {
    this.clearTimers();
  }

  async onBackTapped() {
    if (this.phase === 'study') {
      this.router.navigate(['/brain-games']);
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Leave this game?',
      message: 'Your current round will be reset. You can start again anytime 😊',
      buttons: [
        { text: 'Continue', role: 'cancel' },
        { text: 'Back to Brain Games', handler: () => this.router.navigate(['/brain-games']) },
      ],
    });
    await alert.present();
  }

  backToBrainGames() {
    this.router.navigate(['/brain-games']);
  }

  startNewRound() {
    this.clearTimers();
    this.sessionStartedAtMs = Date.now();

    this.phase = 'study';
    this.isBusy = false;
    this.feedbackMessage = '';

    this.studyCards = this.pickUniqueEmojis(4);
    this.recallCards = [];
    this.selectedAnswers = [];
    this.score = 0;
    this.falseSelections = 0;

    this.distractionCompleted = false;
    this.distractionCards = [];
    this.distractionTargetEmoji = '';
    this.setupDistraction();
  }

  doneStudying() {
    if (this.phase !== 'study') return;
    if (!this.studyCards.length) return;
    this.phase = 'distraction';
    this.isBusy = false;
    this.feedbackMessage = '';
  }

  onColorChoice(choice: 'purple' | 'blue') {
    if (this.phase !== 'distraction') return;
    if (this.isBusy) return;
    if (this.distractionType !== 'color') return;
    if (this.distractionCompleted) return;

    const isCorrect = choice === this.colorTarget;
    this.isBusy = true;

    this.setFeedback(isCorrect ? 'Good job 😊' : 'Nice try 😊', 900);

    if (isCorrect) {
      this.distractionCompleted = true;
      window.setTimeout(() => this.goToRecall(), 900);
      return;
    }

    // Gentle: allow trying again, no penalties.
    window.setTimeout(() => {
      this.isBusy = false;
    }, 700);
  }

  onTapDistractionCard(cardId: number) {
    if (this.phase !== 'distraction') return;
    if (this.isBusy) return;
    if (this.distractionType === 'color') return;
    if (this.distractionCompleted) return;

    const card = this.distractionCards.find(c => c.id === cardId);
    if (!card) return;

    const isTarget = this.distractionTargetSet.length
      ? this.distractionTargetSet.includes(card.emoji)
      : card.emoji === this.distractionTargetEmoji;

    if (!isTarget) {
      this.setFeedback('It’s okay 😊 try again gently', 1200);
      return;
    }

    // Mark target card as selected (visual only).
    card.isSelected = true;

    const allTargetsSelected = this.distractionCards
      .filter(c => (this.distractionTargetSet.length ? this.distractionTargetSet.includes(c.emoji) : c.emoji === this.distractionTargetEmoji))
      .every(c => c.isSelected);

    if (allTargetsSelected) {
      this.distractionCompleted = true;
      this.setFeedback('Good job 😊', 900);
      this.isBusy = true;
      window.setTimeout(() => this.goToRecall(), 900);
    }
  }

  toggleRecallCard(cardId: number) {
    if (this.phase !== 'recall') return;
    if (this.isBusy) return;

    const card = this.recallCards.find(c => c.id === cardId);
    if (!card) return;

    const alreadySelected = card.isSelected;
    const maxSelectable = this.studyCards.length;

    if (!alreadySelected && this.selectedAnswers.length >= maxSelectable) {
      // Calm hint — no penalties.
      this.setFeedback(`Select ${maxSelectable} cards only 😊`, 1200);
      return;
    }

    card.isSelected = !card.isSelected;
    this.selectedAnswers = this.recallCards.filter(c => c.isSelected).map(c => c.id);
  }

  submitRecall() {
    if (this.phase !== 'recall') return;
    if (this.isBusy) return;

    this.isBusy = true;

    const selected = this.recallCards.filter(c => c.isSelected);
    const correct = selected.filter(c => this.studyCards.includes(c.emoji));
    const falseSelected = selected.filter(c => !this.studyCards.includes(c.emoji));

    this.score = correct.length;
    this.falseSelections = falseSelected.length;

    this.recallCards.forEach(c => {
      c.isCorrect = this.studyCards.includes(c.emoji);
    });

    const percent = Math.round((this.score / this.studyCards.length) * 100);
    if (percent === 100) this.setFeedback('Good job 😊', 1200);
    else if (percent >= 50) this.setFeedback('Nice try 😊', 1200);
    else this.setFeedback('It’s okay 😊 try again gently', 1200);

    window.setTimeout(() => {
      this.phase = 'result';
      this.isBusy = false;
      this.saveSession().catch(() => {});
    }, 900);
  }

  playAgain() {
    this.startNewRound();
  }

  private setupDistraction() {
    // Rotate/randomize to keep it varied but simple.
    const pool: DistractionType[] = ['color', 'tap-emoji', 'tap-fruits', 'tap-among-3'];
    const types = this.lastDistractionType ? pool.filter(t => t !== this.lastDistractionType) : pool;
    this.distractionType = types[Math.floor(Math.random() * types.length)];
    this.lastDistractionType = this.distractionType;
    this.distractionCompleted = false;
    this.isBusy = false;
    this.distractionTargetSet = [];

    if (this.distractionType === 'color') {
      this.colorTarget = Math.random() < 0.5 ? 'purple' : 'blue';
      this.distractionPrompt = this.colorTarget === 'purple' ? 'Tap the purple button' : 'Tap the blue button';
      this.distractionCards = [];
      this.distractionTargetEmoji = '';
      return;
    }

    if (this.distractionType === 'tap-fruits') {
      // Fruits set: 🍎 🍌 🍇
      this.distractionTargetSet = ['🍎', '🍌', '🍇'];
      this.distractionTargetEmoji = '';
      this.distractionPrompt = 'Tap all fruits 🍎 🍌 🍇';
      this.distractionCards = this.buildTapDeckFromSet(this.distractionTargetSet, 3, 3);
      return;
    }

    if (this.distractionType === 'tap-emoji') {
      this.distractionTargetEmoji = Math.random() < 0.5 ? '⭐' : '😊';
      this.distractionTargetSet = [];
      this.distractionPrompt = `Tap all ${this.distractionTargetEmoji} emojis`;
      this.distractionCards = this.buildTapDeck(this.distractionTargetEmoji, 3, 3);
      return;
    }

    // tap-among-3: pick the correct emoji among 3 options
    const options = this.shuffle(this.emojiPool).slice(0, 3);
    this.distractionTargetEmoji = options[Math.floor(Math.random() * options.length)];
    this.distractionTargetSet = [this.distractionTargetEmoji];
    this.distractionPrompt = `Tap the ${this.distractionTargetEmoji} emoji`;
    this.distractionCards = options.map((emoji, idx) => ({ id: idx, emoji, isSelected: false }));
  }

  private buildTapDeck(targetEmoji: string, targetCount: number, distractorCount: number): RecallCard[] {
    const distractorPool = this.emojiPool.filter(e => e !== targetEmoji);
    const distractors = this.shuffle(distractorPool).slice(0, distractorCount);

    const deck = this.shuffle([
      ...new Array(targetCount).fill(targetEmoji),
      ...distractors,
    ]);

    return deck.map((emoji, idx) => ({
      id: idx,
      emoji,
      isSelected: false,
    }));
  }

  private buildTapDeckFromSet(targetSet: string[], targetCount: number, distractorCount: number): RecallCard[] {
    const distractorPool = this.emojiPool.filter(e => !targetSet.includes(e));
    const distractors = this.shuffle(distractorPool).slice(0, distractorCount);
    const targets = this.shuffle(targetSet).slice(0, Math.min(targetCount, targetSet.length));
    const deck = this.shuffle([...targets, ...distractors]);
    return deck.map((emoji, idx) => ({ id: idx, emoji, isSelected: false }));
  }

  private goToRecall() {
    this.isBusy = false;
    this.feedbackMessage = '';
    this.phase = 'recall';
    this.buildRecallDeck();
  }

  private buildRecallDeck() {
    const correct = [...this.studyCards];
    const distractors = this.emojiPool.filter(e => !correct.includes(e));

    // Larger set: 4 correct + 2 distractors = 6 cards (clean grid).
    const deckEmojis = this.shuffle([...correct, ...distractors.slice(0, 2)]);

    this.recallCards = deckEmojis.map((emoji, idx) => ({
      id: idx,
      emoji,
      isSelected: false,
    }));
    this.selectedAnswers = [];
  }

  get recallPercent(): number {
    if (!this.studyCards.length) return 0;
    return Math.round((this.score / this.studyCards.length) * 100);
  }

  get retentionRate(): number {
    // Same as recall percent for this design.
    return this.recallPercent;
  }

  private async saveSession() {
    const durationSeconds =
      this.sessionStartedAtMs ? Math.max(0, Math.round((Date.now() - this.sessionStartedAtMs) / 1000)) : 0;

    const sessionData = {
      category: 'memory-recall-challenge',
      totalQuestions: this.studyCards.length,
      correctAnswers: this.score,
      skipped: 0,
      totalTime: durationSeconds,
      delayedRecallPercent: this.recallPercent,
      falseSelections: this.falseSelections,
      retentionRate: this.retentionRate,
      distractionCompleted: this.distractionCompleted,
      distractionType: this.distractionType,
      timestamp: Date.now(),
    };

    await ProgressPage.saveGameSession(this.firebaseService, sessionData as any);
  }

  private pickUniqueEmojis(count: number): string[] {
    return this.shuffle(this.emojiPool).slice(0, count);
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
    if (this.feedbackTimeoutId !== null) window.clearTimeout(this.feedbackTimeoutId);
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackMessage = '';
      this.feedbackTimeoutId = null;
    }, clearAfterMs);
  }

  private clearTimers() {
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }
  }
}

