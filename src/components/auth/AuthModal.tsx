import React, { useState, useEffect } from 'react';
import { Mail, Lock, User as UserIcon, ArrowRight, CheckCircle2, AlertCircle, X, Loader2, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { checkIsSupabaseConfigured } from '../../lib/supabaseClient';

type AuthView = 'login' | 'signup' | 'verify_otp' | 'forgot_password' | 'reset_password_otp';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMessage?: string;
  defaultView?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMessage,
  defaultView = 'login',
}) => {
  const [view, setView] = useState<AuthView>(defaultView);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI states
  const [localError, setLocalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const {
    signUp,
    verifyEmailOtp,
    signInWithPassword,
    resendVerificationOtp,
    requestPasswordReset,
    updatePassword,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const isConfigured = checkIsSupabaseConfigured();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setView(defaultView);
      setLocalError(null);
      setSuccessNotice(null);
      clearError();
    }
  }, [isOpen, defaultView, clearError]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  if (!isOpen) return null;

  const handleClose = () => {
    setLocalError(null);
    setSuccessNotice(null);
    clearError();
    onClose();
  };

  // --- Handlers ---

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!fullName.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const result = await signUp(email, password, fullName);
    if (result.error) {
      setLocalError(result.error.message);
      return;
    }

    if (result.needsEmailVerification) {
      setView('verify_otp');
      setResendCooldown(60);
      setSuccessNotice(`Verification code sent to ${email.trim()}`);
    } else {
      setSuccessNotice('Account created successfully!');
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1000);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Please enter your email and password.');
      return;
    }

    const result = await signInWithPassword(email, password);
    if (result.error) {
      if (result.needsEmailVerification) {
        setView('verify_otp');
        setResendCooldown(60);
        setLocalError('Please verify your email address to continue.');
        return;
      }
      setLocalError(result.error.message);
      return;
    }

    setSuccessNotice('Signed in successfully!');
    setTimeout(() => {
      onSuccess?.();
      handleClose();
    }, 800);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!otpToken.trim()) {
      setLocalError('Please enter the verification code sent to your email.');
      return;
    }

    const result = await verifyEmailOtp(email, otpToken);
    if (result.error) {
      setLocalError(result.error.message || 'Invalid or expired verification code.');
      return;
    }

    setSuccessNotice('Email verified successfully! Welcome to Suchi.');
    setTimeout(() => {
      onSuccess?.();
      handleClose();
    }, 1200);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setLocalError(null);
    clearError();

    const result = await resendVerificationOtp(email);
    if (result.error) {
      setLocalError(result.error.message);
    } else {
      setResendCooldown(60);
      setSuccessNotice(`New verification code sent to ${email.trim()}`);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    const result = await requestPasswordReset(email);
    if (result.error) {
      setLocalError(result.error.message);
    } else {
      setView('reset_password_otp');
      setResendCooldown(60);
      setSuccessNotice(`Password reset code sent to ${email.trim()}`);
    }
  };

  const handleResetPasswordOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!otpToken.trim()) {
      setLocalError('Please enter the reset code from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setLocalError('New password must be at least 6 characters long.');
      return;
    }

    // Verify recovery token
    const verifyRes = await verifyEmailOtp(email, otpToken, 'recovery');
    if (verifyRes.error) {
      setLocalError(verifyRes.error.message || 'Invalid or expired reset code.');
      return;
    }

    // Update password
    const updateRes = await updatePassword(newPassword);
    if (updateRes.error) {
      setLocalError(updateRes.error.message);
      return;
    }

    setSuccessNotice('Password reset successfully! You can now sign in.');
    setTimeout(() => {
      setView('login');
      setPassword('');
      setNewPassword('');
      setOtpToken('');
    }, 1500);
  };

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-slate-800 relative space-y-5">
        {/* Close Button */}
        <button
          onClick={handleClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge & Title */}
        <div className="flex items-center space-x-3">
          <img
            src="/suchi-logo.png"
            alt="Suchi Logo"
            className="w-12 h-12 object-contain drop-shadow-md shrink-0"
          />
          <div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">
              {view === 'login' && 'Welcome Back'}
              {view === 'signup' && 'Create Account'}
              {view === 'verify_otp' && 'Verify Your Email'}
              {view === 'forgot_password' && 'Reset Password'}
              {view === 'reset_password_otp' && 'Set New Password'}
            </h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              {view === 'login' && 'Sign in to access your shared lists'}
              {view === 'signup' && 'Live household sync across family devices'}
              {view === 'verify_otp' && 'Enter the OTP code from your email'}
              {view === 'forgot_password' && 'Enter your email to receive a reset code'}
              {view === 'reset_password_otp' && 'Enter code and your new password'}
            </p>
          </div>
        </div>

        {initialMessage && view !== 'verify_otp' && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-900 dark:text-emerald-300">
            {initialMessage}
          </div>
        )}

        {!isConfigured && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-300 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              Supabase Not Configured Yet
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-400">
              Please set <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> in your <code className="font-mono">.env</code> file.
            </p>
          </div>
        )}

        {/* Global Notifications */}
        {successNotice && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successNotice}</span>
          </div>
        )}

        {displayError && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayError}</span>
            </div>
            {displayError.toLowerCase().includes('rate limit') && (
              <p className="text-[11px] text-red-600 dark:text-red-300/90 leading-relaxed pl-6">
                <strong>Tip:</strong> Supabase limits default test emails to 3 per hour. In your Supabase Dashboard, you can turn off <strong>Confirm email</strong> in <em>Authentication → Providers → Email</em> to sign in and test immediately without email limits.
              </p>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* VIEW 1: SIGN IN */}
        {/* ==================================================================== */}
        {view === 'login' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot_password');
                    setLocalError(null);
                    clearError();
                  }}
                  className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isConfigured || !email.trim() || !password}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-xs text-gray-500 dark:text-slate-400">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setView('signup');
                  setLocalError(null);
                  clearError();
                }}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                Sign Up
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* VIEW 2: SIGN UP */}
        {/* ==================================================================== */}
        {view === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div className="space-y-1">
              <label htmlFor="signup-name" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Akash Sharma"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-email" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-password" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="signup-confirm-password" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isConfigured || !fullName.trim() || !email.trim() || !password}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-xs text-gray-500 dark:text-slate-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setLocalError(null);
                  clearError();
                }}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer ml-1"
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* VIEW 3: VERIFY EMAIL (CONFIRMATION LINK OR OTP CODE) */}
        {/* ==================================================================== */}
        {view === 'verify_otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center py-1 space-y-1">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/80 rounded-2xl flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400 mb-2">
                <KeyRound className="w-6 h-6" />
              </div>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                We sent a confirmation email to:
              </p>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                {email}
              </p>
            </div>

            {/* Dual verification instructions */}
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1.5 text-xs text-emerald-900 dark:text-emerald-300">
              <div className="flex items-start space-x-2">
                <span className="font-black text-emerald-700 dark:text-emerald-400">1.</span>
                <p className="leading-snug">
                  <strong>Click the confirmation link</strong> in the email to verify automatically on this device.
                </p>
              </div>
              <div className="flex items-start space-x-2">
                <span className="font-black text-emerald-700 dark:text-emerald-400">2.</span>
                <p className="leading-snug">
                  <strong>Or enter the verification code</strong> from the email below:
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="otp-input" className="block text-xs font-bold text-gray-700 dark:text-slate-300 text-center">
                Verification Code / Token (Optional if clicking link)
              </label>
              <input
                id="otp-input"
                type="text"
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value.trim())}
                placeholder="Enter 6-digit code or token"
                className="w-full text-center tracking-widest text-base font-black py-2.5 bg-gray-50 dark:bg-slate-800 border-2 border-emerald-500/40 dark:border-emerald-500/40 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 placeholder:font-normal placeholder:tracking-normal placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !otpToken.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify Code & Continue</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setView('signup');
                  setLocalError(null);
                }}
                className="text-gray-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Change email
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || isLoading}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Resend confirmation email'}</span>
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* VIEW 4: FORGOT PASSWORD */}
        {/* ==================================================================== */}
        {view === 'forgot_password' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
              Enter your email address and we'll send you a password reset verification code.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isConfigured || !email.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending Reset Code...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-xs">
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setLocalError(null);
                  clearError();
                }}
                className="font-bold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* VIEW 5: RESET PASSWORD OTP */}
        {/* ==================================================================== */}
        {view === 'reset_password_otp' && (
          <form onSubmit={handleResetPasswordOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reset-otp" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                Reset Code (from email)
              </label>
              <input
                id="reset-otp"
                type="text"
                required
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value.trim())}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-black py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-xs font-bold text-gray-700 dark:text-slate-300">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !otpToken.trim() || !newPassword}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save New Password</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
