import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  showPassword = false;     //Tracks whether the password is visible.

  togglePassword(): void {
    this.showPassword = !this.showPassword;      //Shows or hides the password.
  }

  onSignIn(): void {
    console.log('Sign in button clicked');
  }

  onSignUp(): void {
    console.log('Sign up button clicked');
  }
}
