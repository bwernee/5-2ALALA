import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ToastController, AlertController } from '@ionic/angular';


@Component({
  selector: 'app-progress',
  templateUrl: './progress.page.html',
  styleUrls: ['./progress.page.scss'],
  standalone: false
})
export class ProgressPage implements OnInit {
  @ViewChild('accuracyChart', { static: false }) accuracyChart!: ElementRef;

  selectedPeriod: string = 'today';
  customStartDate: string = '';
  customEndDate: string = '';
  isPatientMode = false;
  
  chart: any;
  chartLoaded = false;
  isLoading = true;

  isFirebaseConnected: boolean = false;
  dataSource: string = 'Loading...';

  overallStats = {
    accuracy: 0,
    avgTimePerCard: 0,
    totalCards: 0,
    skippedCards: 0
  };

  categoryStats: any[] = [
    { name: 'People',        icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Places',        icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Objects',       icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
    { name: 'Category Match',icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 }
  ];

  recentSessions: any[] = [];
  insights: any[] = [];
  hasDataForPeriod: boolean = false;

  isDateRangePickerOpen = false;

  startMonth: string = '';
  startDay: string = '';
  startYear: string = '';
  endMonth: string = '';
  endDay: string = '';
  endYear: string = '';
  availableYears: number[] = [];
  monthOptions: {name: string, value: string}[] = [];
  dateRangeText: string = 'Select date range';


  constructor(
    private firebaseService: FirebaseService,
    private toastController: ToastController,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    await this.loadChartJS();
    await this.loadProgressData();
   
    if (this.chartLoaded) {
      await this.createChart();
    }

    
    this.initializeDatePicker();
    this.updateDateRangeText();

    
    this.subscribeToGameSessions();

    
    window.addEventListener('user-logged-in', (e: any) => {
      
      this.loadProgressData();
    
      if (this.chartLoaded) {
        this.createChart();
      }
      this.subscribeToGameSessions();
    });
  }



  async loadChartJS() {
    try {
      if ((window as any).Chart) {
        this.chartLoaded = true;
        
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => {
        this.chartLoaded = true;
        
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js');
        this.chartLoaded = false;
      };
      document.head.appendChild(script);
    } catch (error) {
      console.error('Failed to load Chart.js:', error);
      this.chartLoaded = false;
    }
  }

  

  // ─── Stats & session processing ─────────────────────────────────────────────
  // Derive overallStats, categoryStats (People/Places/Objects/Category Match), and recentSessions from filtered sessions.


  calculateCategoryStats(sessions: any[]) {
    
    this.categoryStats = [
      { name: 'People',        icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Places',        icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Objects',       icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 },
      { name: 'Category Match',icon: '', accuracy: 0, cardsPlayed: 0, avgTime: 0 }
    ];

    const byName = (name: string) => this.categoryStats.find(c => c.name === name)!;

    const accumulate = (catName: string, sArr: any[]) => {
      if (sArr.length === 0) return;
      let totalQuestions = 0, totalCorrect = 0, totalTime = 0;
      sArr.forEach(s => {
        totalQuestions += s.totalQuestions || 0;
        totalCorrect  += s.correctAnswers || 0;
        totalTime     += s.totalTime || 0;
      });
      const row = byName(catName);
      row.cardsPlayed = totalQuestions;
      row.accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      row.avgTime = totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0;
    };

    const norm = (s: any) => (s.category || '').toLowerCase().replace(/\s+/g, '-');
    const peopleSessions  = sessions.filter(s => norm(s) === 'people'  || norm(s) === 'name-that-memory-people');
    const placesSessions  = sessions.filter(s => norm(s) === 'places'  || norm(s) === 'name-that-memory-places');
    const objectsSessions = sessions.filter(s => norm(s) === 'objects' || norm(s) === 'name-that-memory-objects');
    const cmSessions      = sessions.filter(s => norm(s) === 'category-match' || norm(s) === 'categorymatch');

    

    accumulate('People', peopleSessions);
    accumulate('Places', placesSessions);
    accumulate('Objects', objectsSessions);
    accumulate('Category Match', cmSessions);
  }

 

  private formatCategoryName(category: string): string {
    if (!category) return 'Unknown';
    if (category.toLowerCase() === 'category-match') return 'Category Match';
    return category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  // ─── Chart ─────────────────────────────────────────────────────────────────
  // Chart.js bar/line chart, chart data (labels/datasets by period and category), date buckets, and chart refresh.
   async createChart() {
     if (!this.accuracyChart || !this.chartLoaded || !(window as any).Chart) {
       
       return;
     }

     try {
       const ctx = this.accuracyChart.nativeElement.getContext('2d');
       if (!ctx) {
         console.error('Failed to get canvas context');
         return;
       }

       const chartData = await this.displayChartData();

       if (this.chart) {
         this.chart.destroy();
       }

       //to make today a bar graph
       const chartType = this.selectedPeriod === 'today' ? 'bar' : 'line';

       this.chart = new (window as any).Chart(ctx, {
         type: chartType,
         data: chartData,
         options: {
           responsive: true,
           maintainAspectRatio: false,
           plugins: {
             legend: {
               display: true,
               position: 'bottom',
               labels: {
                 usePointStyle: true,
                 pointStyle: 'rect',
                 padding: 15,
                 font: {
                   size: 12,
                   family: 'Poppins'
                 },
                 generateLabels: function(chart: any) {
                   const original = (window as any).Chart.defaults.plugins.legend.labels.generateLabels;
                   const labels = original.call(this, chart);
                   
                   
                   labels.forEach((label: any) => {
                     label.pointStyle = 'rect';
                     label.pointStyleWidth = 8;  
                     label.pointStyleHeight = 8; 
                   });
                   
                   return labels;
                 }
               }
             },
             tooltip: {
               mode: 'index',
               intersect: false
             }
           },
           interaction: {
             mode: 'index',
             intersect: false
           },
           scales: {
             y: {
               beginAtZero: true,
               max: 100,
               ticks: {
                 callback: function(value: any) {
                   return value + '%';
                 }
               }
             }
           },
           elements: chartType === 'bar' ? {
             bar: {
               borderWidth: 1,
               borderRadius: 4
             }
           } : {
             line: {
               tension: 0.3,
               borderWidth: 2
             },
             point: {
               radius: 3,
               borderWidth: 2
             }
           }
         }
       });

       
       this.chart.data.datasets.forEach((ds: any, idx: number) => {
         
       });
     } catch (error) {
       console.error('Error creating chart:', error);
     }
   }

  
  async updateChart() {
    if (!this.chart) {
      await this.createChart();
      return;
    }
    try {
      const chartData = await this.displayChartData();

      
      chartData.datasets.forEach((ds: any, idx: number) => {
        
      });

      
      this.chart.destroy();
      await this.createChart();

      
    } catch (error) {
      console.error('Error updating chart:', error);
    }
  }

   getXAxisTitle(): string {
     switch (this.selectedPeriod) {
       case 'today':
         return 'Today';
       case 'week':
         return 'Days';
       case 'month':
         return 'Months';
       default:
         return 'Days';
     }
   }

  async forceRefresh() {
    
    try {
      
      const pid = localStorage.getItem('selectedPatientId') || localStorage.getItem('userId');
      localStorage.removeItem('gameSessions');
      if (pid) localStorage.removeItem(`gameSessions_${pid}`);
     
      if (this.chart) {
        await this.updateChart();
      } else if (this.chartLoaded) {
        await this.createChart();
      }
      
    } catch (error) {
      console.error('Error refreshing progress data:', error);
    }
  }

  togglePatientMode() {
    this.isPatientMode = !this.isPatientMode;
    
  }

 

  
  private async recalculateForCurrentFilter() {
    const sessions = await this.fetchGameSessions();
    this.calculateOverallStats(sessions);
    this.calculateCategoryStats(sessions);
    await this.updateChart();
  }

  // ─── Custom date range picker ──────────────────────────────────────────────
  // Toggle/open/close picker, apply range, toast, date range text, wheel init, scroll/infinite scroll, month/day/year selectors, updateCustomDates.
  toggleDateRangePicker() {
    if (!this.isDateRangePickerOpen) {
      this.openDateRangePicker();
    } else {
      this.closeDateRangePicker();
    }
  }

  closeDateRangePicker() {
    this.isDateRangePickerOpen = false;
    this.removeScrollListeners();
  }

  
  removeScrollListeners() {
    const wheelScrolls = document.querySelectorAll('.wheel-scroll');
    wheelScrolls.forEach((scrollElement: any) => {
      if (scrollElement) {
        
        const newElement = scrollElement.cloneNode(true);
        scrollElement.parentNode.replaceChild(newElement, scrollElement);
      }
    });
  }

  async applyDateRange() {
    console.log('Apply button clicked - Current dates:', {
      startMonth: this.startMonth,
      startDay: this.startDay,
      startYear: this.startYear,
      endMonth: this.endMonth,
      endDay: this.endDay,
      endYear: this.endYear,
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });
    
    
    this.updateCustomDates();
    
    console.log('After updateCustomDates:', {
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });
    
    
    this.selectedPeriod = 'custom';
    
    
    this.isDateRangePickerOpen = false;
    
    
    this.onCustomDateChange();
    
    
    this.cdr.detectChanges();
    
    
    setTimeout(() => {
      this.updateDateRangeText();
      this.cdr.detectChanges();
      
    }, 100);
    
    
    await this.showConfirmationToast();
  }

  async showConfirmationToast() {
    const toast = await this.toastController.create({
      message: 'Date range saved successfully!',
      duration: 2000,
      position: 'top',
      color: 'success',
      cssClass: 'custom-toast',
      buttons: [
        {
          text: '',
          role: 'cancel',
          handler: () => {
            
          }
        }
      ]
    });
    
    await toast.present();
  }

  getDateRangeText(): string {
    console.log('getDateRangeText called with:', {
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });
    
    if (!this.customStartDate || !this.customEndDate) {
      
      return 'Select date range';
    }
    
    try {
      
      const startDateStr = this.customStartDate.includes('-') ? this.customStartDate : 
        `${this.customStartDate.slice(0,4)}-${this.customStartDate.slice(4,6)}-${this.customStartDate.slice(6,8)}`;
      const endDateStr = this.customEndDate.includes('-') ? this.customEndDate : 
        `${this.customEndDate.slice(0,4)}-${this.customEndDate.slice(4,6)}-${this.customEndDate.slice(6,8)}`;
      
      
      
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        
        return 'Select date range';
      }
      
      const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
      };
      
      const formattedText = `${formatDate(startDate)} - ${formatDate(endDate)}`;
      
      
      return formattedText;
    } catch (error) {
      console.error('Error formatting date range:', error);
      return 'Select date range';
    }
  }

  
  updateDateRangeText() {
    console.log('updateDateRangeText called with:', {
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });
    
    if (!this.customStartDate || !this.customEndDate) {
      this.dateRangeText = 'Select date range';
      
      return;
    }
    
    try {
    const startDate = new Date(this.customStartDate);
    const endDate = new Date(this.customEndDate);
      
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        
        this.dateRangeText = 'Select date range';
        return;
      }
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
    };
    
      this.dateRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;
      
      
    } catch (error) {
      console.error('Error formatting date range:', error);
      this.dateRangeText = 'Select date range';
    }
  }

  
  initializeDatePicker() {
    
    const currentYear = new Date().getFullYear();
    this.availableYears = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      this.availableYears.push(i);
    }

    
    this.monthOptions = [
      {name: 'January', value: '01'},
      {name: 'February', value: '02'},
      {name: 'March', value: '03'},
      {name: 'April', value: '04'},
      {name: 'May', value: '05'},
      {name: 'June', value: '06'},
      {name: 'July', value: '07'},
      {name: 'August', value: '08'},
      {name: 'September', value: '09'},
      {name: 'October', value: '10'},
      {name: 'November', value: '11'},
      {name: 'December', value: '12'}
    ];

    
    if (!this.startMonth || !this.startDay || !this.startYear) {
      const now = new Date();
      this.startMonth = String(now.getMonth() + 1).padStart(2, '0');
      this.startDay = String(now.getDate()).padStart(2, '0');
      this.startYear = String(now.getFullYear());
      this.endMonth = String(now.getMonth() + 1).padStart(2, '0');
      this.endDay = String(now.getDate()).padStart(2, '0');
      this.endYear = String(now.getFullYear());
    }

    
    this.updateCustomDates();
  }

  
  openDateRangePicker() {
    
    const now = new Date();
     
    
    this.startMonth = String(now.getMonth() + 1).padStart(2, '0');
    this.startDay = String(now.getDate()).padStart(2, '0');
    this.startYear = String(now.getFullYear());
    this.endMonth = String(now.getMonth() + 1).padStart(2, '0');
    this.endDay = String(now.getDate()).padStart(2, '0');
    this.endYear = String(now.getFullYear());
    
     
     
    
    this.initializeDatePicker();
    this.isDateRangePickerOpen = true;
    
    
    setTimeout(() => {
      this.scrollToMiddle();
    }, 100);
  }

  
  scrollToMiddle() {
    const wheelScrolls = document.querySelectorAll('.wheel-scroll');
    wheelScrolls.forEach((scrollElement: any, index: number) => {
      if (scrollElement) {
        
        const itemHeight = 24; 
        const itemsPerSet = scrollElement.children.length / 3; 
        const oneSetHeight = itemsPerSet * itemHeight;
        
        
        const middlePosition = oneSetHeight;
        scrollElement.scrollTop = middlePosition;
        
        console.log(`Wheel ${index}:`, {
          totalChildren: scrollElement.children.length,
          itemsPerSet,
          oneSetHeight,
          middlePosition
        });
        
        
        this.addInfiniteScrollListener(scrollElement, oneSetHeight);
      }
    });
  }

  
  addInfiniteScrollListener(scrollElement: any, oneSetHeight: number) {
    let isScrolling = false;
    
    scrollElement.addEventListener('scroll', () => {
      if (isScrolling) return;
      
      const scrollTop = scrollElement.scrollTop;
      const scrollHeight = scrollElement.scrollHeight;
      const clientHeight = scrollElement.clientHeight;
      
      console.log('Scroll Debug:', {
        scrollTop,
        scrollHeight,
        clientHeight,
        oneSetHeight,
        middlePosition: oneSetHeight,
        topThreshold: oneSetHeight * 0.5,
        bottomThreshold: oneSetHeight * 2.5
      });
      
      
      if (scrollTop <= oneSetHeight * 0.5) {
        isScrolling = true;
        
        scrollElement.scrollTop = oneSetHeight;
        setTimeout(() => { isScrolling = false; }, 100);
      }
      
      else if (scrollTop >= oneSetHeight * 2.5) {
        isScrolling = true;
        
        scrollElement.scrollTop = oneSetHeight;
        setTimeout(() => { isScrolling = false; }, 100);
      }
    });
  }

  
  selectStartMonth(month: string) {
    
    this.startMonth = month;
    this.updateCustomDates();
  }

  selectStartDay(day: number) {
    
    this.startDay = String(day).padStart(2, '0');
    this.updateCustomDates();
  }

  selectStartYear(year: number) {
    
    this.startYear = String(year);
    this.updateCustomDates();
  }

  selectEndMonth(month: string) {
    
    this.endMonth = month;
    this.updateCustomDates();
  }

  selectEndDay(day: number) {
    
    this.endDay = String(day).padStart(2, '0');
    this.updateCustomDates();
  }

  selectEndYear(year: number) {
    
    this.endYear = String(year);
    this.updateCustomDates();
  }

  navigateMonth(type: 'start' | 'end', direction: 'prev' | 'next') {
    const isStart = type === 'start';
    const monthField = isStart ? 'startMonth' : 'endMonth';
    const yearField = isStart ? 'startYear' : 'endYear';
    
    let currentMonth = parseInt(this[monthField]);
    let currentYear = parseInt(this[yearField]);
    
    if (direction === 'prev') {
      currentMonth--;
      if (currentMonth < 1) {
        currentMonth = 12;
        currentYear--;
      }
    } else {
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }
    
    this[monthField] = String(currentMonth).padStart(2, '0');
    this[yearField] = String(currentYear);
    
    this.updateCustomDates();
  }

  getDaysInMonth(month: string, year: string): number[] {
    if (!month || !year) return [];
    
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const days: number[] = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  }

  private updateCustomDates() {
    console.log('updateCustomDates called with:', {
      startMonth: this.startMonth,
      startDay: this.startDay,
      startYear: this.startYear,
      endMonth: this.endMonth,
      endDay: this.endDay,
      endYear: this.endYear
    });
    
    if (this.startMonth && this.startDay && this.startYear) {
      this.customStartDate = `${this.startYear}-${this.startMonth}-${this.startDay}`;
      
    } else {
      console.log('Start date not complete:', {
        startMonth: this.startMonth,
        startDay: this.startDay,
        startYear: this.startYear
      });
    }
    
    if (this.endMonth && this.endDay && this.endYear) {
      this.customEndDate = `${this.endYear}-${this.endMonth}-${this.endDay}`;
      
    } else {
      console.log('End date not complete:', {
        endMonth: this.endMonth,
        endDay: this.endDay,
        endYear: this.endYear
      });
    }
    
    console.log('Final custom dates:', {
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate
    });
    
    
    this.updateDateRangeText();
  }
  checkPatientMode() {
    const savedMode = localStorage.getItem('patientMode');
    this.isPatientMode = savedMode === 'true';
  }

  onPatientModeToggle() {
    window.dispatchEvent(new CustomEvent('caregiver-toggle'));
  }

  navigateToPatientsDashboard() {
    this.router.navigate(['/patients-dashboard']);
  }

  navigateToHome() {
    this.router.navigate(['/home']);
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
  }
  async updateFirebaseStats(sessions: any[]) {
    try {
      console.log(' updateFirebaseStats called with:', {
        isFirebaseConnected: this.isFirebaseConnected,
        sessionsCount: sessions.length,
        overallStats: this.overallStats,
        categoryStatsCount: this.categoryStats.length,
        recentSessionsCount: this.recentSessions.length
      });
  
      if (!this.isFirebaseConnected) {
        
        return;
      }
  
      const accuracyOverTime = this.calculateAccuracyOverTime(sessions);
      
      
      const statsData = {
        overallStats: this.overallStats,
        categoryStats: this.categoryStats,
        recentSessions: this.recentSessions,
        accuracyOverTime: accuracyOverTime
      };
  
      
      
      await this.firebaseService.updateUserStats(statsData);
  
      
    } catch (error) {
      console.error('Failed to update Firebase stats:', error);
    }
  }
  calculateAccuracyOverTime(sessions: any[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
    const calculateAccuracy = (filteredSessions: any[]) => {
      if (filteredSessions.length === 0) return 0;
      const totalQuestions = filteredSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
      const totalCorrect = filteredSessions.reduce((sum, s) => sum + (s.correctAnswers || 0), 0);
      return totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    };
  
    const todaySessions = sessions.filter(s => {
      const sessionDate = new Date(s.timestamp || s.createdAt || 0);
      return sessionDate >= today;
    });
  
    const weekSessions = sessions.filter(s => {
      const sessionDate = new Date(s.timestamp || s.createdAt || 0);
      return sessionDate >= weekAgo;
    });
  
    const monthSessions = sessions.filter(s => {
      const sessionDate = new Date(s.timestamp || s.createdAt || 0);
      return sessionDate >= monthAgo;
    });
  
    return {
      today: calculateAccuracy(todaySessions),
      week: calculateAccuracy(weekSessions),
      month: calculateAccuracy(monthSessions),
      allTime: calculateAccuracy(sessions)
    };
  }
    

  
  static async saveGameSession(firebaseService: FirebaseService, sessionData: {
    category: string;
    totalQuestions: number;
    correctAnswers: number;
    skipped: number;
    totalTime: number;
    timestamp?: number;
  }, progressPageInstance?: ProgressPage) {
    try {
      const sessionWithTimestamp = { ...sessionData, timestamp: sessionData.timestamp || Date.now() };
  
      
      await firebaseService.saveGameSession(sessionWithTimestamp);
  
      
      const pid = localStorage.getItem('selectedPatientId') || localStorage.getItem('userId');
      const key = pid ? `gameSessions_${pid}` : 'gameSessions';
      const sessions = JSON.parse(localStorage.getItem(key) || '[]');
      sessions.push(sessionWithTimestamp);
      localStorage.setItem(key, JSON.stringify(sessions));
  
      
  
      
      if (progressPageInstance) {
        await progressPageInstance.recalculateForCurrentFilter();
      }
    } catch (error) {
      console.error('Error saving game session:', error);
    }
  }


  async fetchGameSessions() {
    try {
      let allSessions: any[] = [];
      try {
        allSessions = await this.firebaseService.getUserGameSessions();
        this.isFirebaseConnected = true;
        this.dataSource = 'Firebase';
        this.firebaseService.cacheData('gameSessions', allSessions);
      } catch (fbErr) {
        console.warn('fetchGameSessions: firebase fetch failed', fbErr);
        this.isFirebaseConnected = false;
        allSessions = this.firebaseService.getCachedData('gameSessions', []);
        if ((!allSessions || allSessions.length === 0)) {
          const pid = localStorage.getItem('selectedPatientId') || localStorage.getItem('userId');
          const localKey = pid ? `gameSessions_${pid}` : 'gameSessions';
          const raw = localStorage.getItem(localKey) || '[]';
          try { allSessions = JSON.parse(raw); } catch { allSessions = []; }
        }
        this.dataSource = allSessions && allSessions.length > 0 ? 'Local Storage' : 'No Data';
      }
      return this.filterSessionsByPeriod(allSessions);
    } catch (error) {
      console.error('Error getting game session data:', error);
    }
    return [];
  }


  async loadProgressData() {
    this.isLoading = true;
    try {
      const sessions = await this.fetchGameSessions() || [];
      this.calculateOverallStats(sessions);
      
      if (sessions.length === 0) {
        this.categoryStats.forEach(c => { c.accuracy = 0; c.cardsPlayed = 0; c.avgTime = 0; });
      }

      await this.updateFirebaseStats(sessions).catch(err => 
        console.error('Firebase stats update failed:', err)
      );
    } catch (error) {
      console.error('Error loading progress data:', error);
      this.dataSource = 'Error';
    } finally {
      this.isLoading = false;
    }
  }

  calculateOverallStats(sessions: any[]) {
    const defaultStats = { accuracy: 0, avgTimePerCard: 0, totalCards: 0, skippedCards: 0 };
    
    if (sessions.length === 0) {
      this.overallStats = defaultStats;
      return;
    }

    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalTime = 0;
    let totalSkipped = 0;

    for (const session of sessions) {
      totalQuestions += session.totalQuestions || 0;
      totalCorrect += session.correctAnswers || 0;
      totalTime += session.totalTime || 0;
      totalSkipped += session.skipped || 0;
    }

    const totals = {
      questions: totalQuestions,
      correct: totalCorrect,
      time: totalTime,
      skipped: totalSkipped
    };

    this.overallStats = {
      accuracy: totals.questions > 0 ? Math.round((totals.correct / totals.questions) * 100) : 0,
      avgTimePerCard: totals.questions > 0 ? Math.round(totals.time / totals.questions) : 0,
      totalCards: totals.questions,
      skippedCards: totals.skipped
    };
  }



  async forceUpdateFirebaseStats() {
    try {
      
      const sessions = await this.firebaseService.getUserGameSessions();
      
      
      if (sessions.length > 0) {
        this.calculateOverallStats(sessions);
        this.calculateCategoryStats(sessions);
        
        await this.updateFirebaseStats(sessions);
        
      } else {
        
      }
    } catch (error) {
      console.error('Force update failed:', error);
    }
  }


   //called from firebase.service.ts
   private subscribeToGameSessions() {
    try {
      this.firebaseService.subscribeToGameSessions((sessions) => {
        
        const filtered = this.filterSessionsByPeriod(sessions);
        this.calculateOverallStats(filtered);
        this.calculateCategoryStats(filtered);
        this.updateChart();
      });
    } catch (e) {
      console.error('Failed to subscribe to game sessions:', e);
    }
   }


   async displayChartData() {
    try {
      let sessions: any[] = await this.fetchGameSessions();

      if (!sessions || sessions.length === 0) {
        
        this.hasDataForPeriod = false;
        
        
        let labels: string[] = [];
        
        if (this.selectedPeriod === 'custom' && this.customStartDate && this.customEndDate) {
          const startDate = new Date(this.customStartDate);
          const endDate = new Date(this.customEndDate);
          labels = [`${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`];
        } else {
          
          switch (this.selectedPeriod) {
            case 'today':
              labels = ['Today'];
              break;
            case 'week':
              labels = ['This Week'];
              break;
            case 'month':
              labels = [new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })];
              break;
            case 'all':
              labels = ['All Time'];
              break;
            default:
              labels = ['Today'];
          }
        }
        
        const emptyDataset = (label: string, color: string) => ({
          label,
          data: new Array(labels.length).fill(0),
          borderColor: color,
          backgroundColor: color + '33',
          fill: false,
          tension: 0.3
        });
        
        return {
          labels,
          datasets: [
            emptyDataset('Name That Memory - People', '#3b82f6'),
            emptyDataset('Name That Memory - Places', '#10b981'),
            emptyDataset('Name That Memory - Objects', '#f59e0b'),
            emptyDataset('Category Match', '#ef4444')
          ]
        } as any;
      }

      
      const dateRange = this.getChartDateRangeFromSessions(sessions);
      const labels = dateRange.map(d => d.label);

      // Handle no data for custom period
      if (this.selectedPeriod === 'custom' && dateRange.length === 0) {
        this.hasDataForPeriod = false;
        const customRange = this.getCustomDateRange();
        const periodLabel = customRange 
          ? `${customRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${customRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : 'No Data';
        
        const emptyDataset = (label: string, color: string) => ({
          label,
          data: [0],
          borderColor: color,
          backgroundColor: color + '33',
          fill: false,
          tension: 0.3
        });
        
        return {
          labels: [periodLabel],
          datasets: [
            emptyDataset('Name That Memory - People', '#3b82f6'),
            emptyDataset('Name That Memory - Places', '#10b981'),
            emptyDataset('Name That Memory - Objects', '#f59e0b'),
            emptyDataset('Category Match', '#ef4444')
          ]
        } as any;
      }

      const grouped = this.groupSessionsIntoBuckets(sessions, dateRange);

      
      for (const [key, sArr] of Object.entries(grouped)) {
        
      }

      
      const cats = [
        { key: 'people', label: 'Name That Memory - People', color: '#3b82f6' },
        { key: 'places', label: 'Name That Memory - Places', color: '#10b981' },
        { key: 'objects', label: 'Name That Memory - Objects', color: '#f59e0b' },
        { key: 'category-match', label: 'Category Match', color: '#ef4444' }
      ];

      //today
      if (this.selectedPeriod === 'today') {
        const datasets = cats.map(cat => {
          
          const todaySessions = sessions.filter(s => {
            const sessionDate = new Date(s.timestamp || s.createdAt || 0);
            const today = new Date();
            const isToday = sessionDate.toDateString() === today.toDateString();
            return isToday && this.isSessionInCategory(s, cat.key);
          });

          let accuracy = 0;
          if (todaySessions.length > 0) {
            const totalCorrect = todaySessions.reduce((sum, s) => sum + (s.correctAnswers || 0), 0);
            const totalQuestions = todaySessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
            accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
          }

          return {
            label: cat.label,
            data: [accuracy],
            borderColor: cat.color,
            backgroundColor: cat.color + '80',
            borderWidth: 1,
            borderRadius: 4
          } as any;
        });

        this.hasDataForPeriod = true;
        return { 
          labels: ['Today'], 
          datasets 
        } as any;
      }

      
      const datasets = cats.map(cat => {
        const data = dateRange.map((dr, drIdx) => {
          const bucketKey = dr.key;
          const allBucketSessions = grouped[bucketKey] || [];
          const bucketSessions: any[] = allBucketSessions.filter((s: any) => this.isSessionInCategory(s, cat.key));

          

          if (!bucketSessions || bucketSessions.length === 0) return 0;
          const totalCorrect = bucketSessions.reduce((sum, s) => sum + (s.correctAnswers || 0), 0);
          const totalQuestions = bucketSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
          const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
          
          return accuracy;
        });

        

        return {
          label: cat.label,
          data,
          borderColor: cat.color,
          backgroundColor: cat.color + '33',
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointBorderWidth: 2,
          pointBackgroundColor: cat.color,
          pointBorderColor: '#fff'
        } as any;
      });

      this.hasDataForPeriod = true;
      const chartData = { labels, datasets };
      
      datasets.forEach((ds, idx) => {
        
      });
      return chartData;
    } catch (error) {
      console.error('Error generating chart data:', error);
      return { labels: ['Error'], datasets: [] } as any;
    }
  }

  
  private isSessionInCategory(session: any, catKey: string): boolean {
  const c = (session.category || '').toString().toLowerCase().replace(/\s+/g, '-'); 
  if (catKey === 'category-match') {
    return c === 'category-match' || c === 'categorymatch' || c === 'category match';
  } else {
    return c === catKey || c === `name-that-memory-${catKey}`;
  }
  }

  private getCustomDateRange(): { start: Date; end: Date } | null {
    if (!this.customStartDate || !this.customEndDate) {
      return null;
    }
    const start = new Date(this.customStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(this.customEndDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private isSessionInDateRange(session: any, start: Date, end: Date): boolean {
    const ts = session.timestamp || session.createdAt || 0;
    const sessionDate = new Date(ts);
    return !isNaN(sessionDate.getTime()) && sessionDate >= start && sessionDate <= end;
  }

  private getUniqueDatesFromSessions(sessions: any[]): Array<{ key: string; date: Date }> {
    const uniqueDatesMap = new Map<string, Date>();
    sessions.forEach(s => {
      const sessionDate = new Date(s.timestamp || s.createdAt || 0);
      if (!isNaN(sessionDate.getTime())) {
        const dateKey = sessionDate.toISOString().split('T')[0];
        if (!uniqueDatesMap.has(dateKey)) {
          uniqueDatesMap.set(dateKey, sessionDate);
        }
      }
    });
    return Array.from(uniqueDatesMap.entries())
      .map(([key, date]) => ({ key, date }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private createDayBucket(date: Date): { key: string; label: string; start: Date; end: Date } {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const key = dayStart.toISOString().split('T')[0];
    const label = dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { key, label, start: dayStart, end: dayEnd };
  }

//switchcase

  private getChartDateRangeFromSessions(sessions: any[]) {
    const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];

    if (this.selectedPeriod === 'today') {
      buckets.push(this.createDayBucket(new Date()));
      return buckets;
    }

    if (this.selectedPeriod === 'custom') {
      const customRange = this.getCustomDateRange();
      if (!customRange) return buckets;

      const filteredSessions = (sessions || []).filter(s => 
        this.isSessionInDateRange(s, customRange.start, customRange.end)
      );
      
      if (filteredSessions.length === 0) return buckets;

      const sortedDates = this.getUniqueDatesFromSessions(filteredSessions);
      for (const { date } of sortedDates) {
        buckets.push(this.createDayBucket(date));
      }
      return buckets;
    }

    if (this.selectedPeriod === 'all') {
      if (!sessions || sessions.length === 0) return buckets;

      const sortedDates = this.getUniqueDatesFromSessions(sessions);
      for (const { date } of sortedDates) {
        buckets.push(this.createDayBucket(date));
      }
      return buckets;
    }

    // For week/month periods
    let earliestDate: Date | null = null;
    if (sessions && sessions.length > 0) {
      const sessionDates = sessions
        .map(s => new Date(s.timestamp || s.createdAt || 0))
        .filter(d => !isNaN(d.getTime()));
      if (sessionDates.length > 0) {
        earliestDate = new Date(Math.min(...sessionDates.map(d => d.getTime())));
      }
    }
    if (!earliestDate || isNaN(earliestDate.getTime())) {
      earliestDate = new Date();
    }

    const startDate = new Date(earliestDate);
    startDate.setHours(0, 0, 0, 0);

    let endDate: Date;
    if (this.selectedPeriod === 'month') {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 5);
    } else {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
    }
    endDate.setHours(23, 59, 59, 999);

    if (this.selectedPeriod === 'month') {
      const current = new Date(startDate);
      while (current <= endDate) {
        const monthStart = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
        const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
        const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        buckets.push({ key, label, start: monthStart, end: monthEnd });
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      const current = new Date(startDate);
      while (current <= endDate) {
        buckets.push(this.createDayBucket(current));
        current.setDate(current.getDate() + 1);
      }
    }

    return buckets;
  }

  filterSessionsByPeriod(sessions: any[]) {
    if (this.selectedPeriod === 'all') {
      return sessions.slice();
    }

    if (this.selectedPeriod === 'custom') {
      const customRange = this.getCustomDateRange();
      if (!customRange) return [];
      return sessions.filter(s => this.isSessionInDateRange(s, customRange.start, customRange.end));
    }

    const dateBuckets = this.getChartDateRangeFromSessions(sessions);
    if (!dateBuckets || dateBuckets.length === 0) return [];

    const start = dateBuckets[0].start;
    const end = dateBuckets[dateBuckets.length - 1].end;
    return sessions.filter(s => this.isSessionInDateRange(s, start, end));
  }


  onPeriodChange() {
    
    this.recalculateForCurrentFilter();
  }

  onCustomDateChange() {
    if (this.customStartDate && this.customEndDate) {
      this.recalculateForCurrentFilter();
    }
  }

  
  private groupSessionsIntoBuckets(sessions: any[], dateRange: Array<{ key: string; label: string; start: Date; end: Date }>) {
    const map: Record<string, any[]> = {};
    for (const dr of dateRange) map[dr.key] = [];
    for (const s of sessions) {
      const ts = (s.timestamp || s.createdAt || 0);
      const d = new Date(ts);
      for (const dr of dateRange) {
        if (d >= dr.start && d <= dr.end) {
          map[dr.key].push(s);
          break;
        }
      }
    }
    return map;
  }

  
}