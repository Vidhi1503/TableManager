import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  private router = inject(Router);

  collapsed = signal(false);   // laptop/tablet: sidebar chhota
  mobile = signal(false);      // mobile screen hai ya nahi
  mobileOpen = signal(false);  // mobile: drawer khula hai ya nahi
  dark = signal(false);

  private mode = '';

  constructor() {
    this.checkScreen();
  }

  // Screen ka size badalne par chalta hai
  @HostListener('window:resize')
  checkScreen() {
    const w = window.innerWidth;
    const mode = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'laptop';

    // Sirf tab badlo jab screen ka type badle (scroll par address bar se gadbad na ho)
    if (mode === this.mode) return;
    this.mode = mode;

    this.mobile.set(mode === 'mobile');
    this.collapsed.set(mode === 'tablet');
    this.mobileOpen.set(false);
  }

  toggleMenu() {
    if (this.mobile()) {
      this.mobileOpen.update((v) => !v);
    } else {
      this.collapsed.update((v) => !v);
    }
  }

  // Mobile par link dabane ke baad drawer band ho jaye
  closeMenu() {
    if (this.mobile()) this.mobileOpen.set(false);
  }

  toggleTheme() {
    this.dark.update((v) => !v);
    document.body.classList.toggle('dark', this.dark());
  }

  logout() {
  sessionStorage.removeItem('token');
  this.router.navigate(['/login']);
}
}