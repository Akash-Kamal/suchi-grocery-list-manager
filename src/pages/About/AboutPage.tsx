import React from 'react';
import {
  Calendar,
  ListChecks,
  Share2,
  Users,
  Heart,
  Repeat,
  Home as HomeIcon,
  WifiOff,
  UserCheck,
  Smartphone,
  CheckCircle2,
  Sparkles,
  Zap,
  ShoppingBag,
  ShieldCheck,
  Code2,
} from 'lucide-react';

interface AboutPageProps {
  onNavigate?: (path: any) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  const features = [
    {
      title: '1. Monthly Grocery Planning',
      description: 'Plan and organize regular household groceries in advance.',
      icon: Calendar,
      tag: 'Planning',
    },
    {
      title: '2. Smart Grocery Lists',
      description: 'Create lists, add items, quantities, units, categories, and notes, and keep everything organized.',
      icon: ListChecks,
      tag: 'Organization',
    },
    {
      title: '3. Shared Lists',
      description: 'Share a grocery list with family members, friends, or roommates through a shareable link.',
      icon: Share2,
      tag: 'Sharing',
    },
    {
      title: '4. Real-Time Collaboration',
      description:
        'Up to 9 members can collaborate on the same shared grocery list at the same time. Members can add, edit, and complete items while changes synchronize across the shared list.',
      icon: Users,
      tag: 'Real-Time',
    },
    {
      title: '5. Favorites',
      description: 'Save frequently purchased items for quick access when creating new lists.',
      icon: Heart,
      tag: 'Convenience',
    },
    {
      title: '6. Recurring Items',
      description: 'Keep track of regularly purchased grocery items and make future shopping easier.',
      icon: Repeat,
      tag: 'Automation',
    },
    {
      title: '7. Household Organization',
      description: 'Keep shared grocery activity organized within a household.',
      icon: HomeIcon,
      tag: 'Household',
    },
    {
      title: '8. Offline-Friendly Experience',
      description:
        'Allow users to continue working with their lists when temporarily offline and synchronize changes when connectivity returns.',
      icon: WifiOff,
      tag: 'Offline-First',
    },
    {
      title: '9. Personal Accounts',
      description: 'Users can create an account and securely access their own grocery lists and household data.',
      icon: UserCheck,
      tag: 'Security',
    },
    {
      title: '10. Progressive Web App',
      description:
        'SUCHI is designed as a modern web application that can provide an app-like experience on supported devices.',
      icon: Smartphone,
      tag: 'PWA',
    },
  ];

  const whyPillars = [
    {
      title: 'Simple',
      summary: 'Designed to keep grocery management straightforward without unnecessary clutter or complex steps.',
      icon: Zap,
    },
    {
      title: 'Collaborative',
      summary: 'Built from the ground up for households, families, and shared shopping trips in real time.',
      icon: Users,
    },
    {
      title: 'Organized',
      summary: 'Keep everything you need for shopping in one unified, offline-capable workspace.',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-8 pb-24 max-w-4xl mx-auto animate-fade-in text-slate-900 dark:text-slate-100">
      {/* ─── Hero Header ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-emerald-800/50">
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-400/30 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Platform Overview</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <img
              src="/suchi-logo.png"
              alt="SUCHI Logo"
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-xl"
            />
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                About SUCHI
              </h1>
              <p className="text-sm sm:text-base text-emerald-300 font-medium mt-1">
                A smarter way to plan, organize, and manage everyday groceries.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-sm sm:text-base text-emerald-100/90 leading-relaxed max-w-2xl font-normal">
              SUCHI is a modern grocery management platform designed to simplify the way individuals, families, and households plan, organize, and manage their everyday shopping.
            </p>
            <p className="text-xs sm:text-sm text-emerald-200/80 leading-relaxed max-w-2xl mt-2">
              From monthly grocery planning to quick weekly shopping trips, SUCHI brings everything into one organized workspace. Users can create and manage grocery lists, add quantities and notes, categorize items, mark purchases as completed, and keep track of frequently purchased essentials.
            </p>
          </div>
        </div>

        {/* Subtle Decorative Background Glow */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* ─── Core Capabilities Grid ─────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight">
              Platform Capabilities
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Ten powerful pillars built into SUCHI's design
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900/90 rounded-2xl p-5 border border-emerald-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all duration-200 space-y-2 flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center text-emerald-700 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                      {feature.tag}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-gray-900 dark:text-white">
                    {feature.title}
                  </h3>

                  <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Built for Real-Life Shopping ───────────────────────────── */}
      <section className="bg-emerald-50/70 dark:bg-emerald-950/40 rounded-3xl p-6 sm:p-8 border border-emerald-200 dark:border-emerald-800/80 shadow-sm space-y-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-700/20">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-100">
              Built for Real-Life Shopping
            </h2>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              Seamless household collaboration in practice
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900/90 rounded-2xl border border-emerald-100 dark:border-slate-800 space-y-3">
          <p className="text-xs sm:text-sm text-gray-700 dark:text-slate-200 italic leading-relaxed font-medium">
            "Imagine a family preparing their monthly grocery list."
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 bg-emerald-50/50 dark:bg-slate-800/60 rounded-xl border border-emerald-100/80 dark:border-slate-700/80 space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                Step 1: At Home
              </span>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                One person adds rice, flour, and cooking oil from home pantry checks.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/50 dark:bg-slate-800/60 rounded-xl border border-emerald-100/80 dark:border-slate-700/80 space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                Step 2: On The Go
              </span>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                Another member adds fresh vegetables and spices while at the local market.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/50 dark:bg-slate-800/60 rounded-xl border border-emerald-100/80 dark:border-slate-700/80 space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                Step 3: In Store
              </span>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                Someone else checks off items in real time while walking the store aisles.
              </p>
            </div>
          </div>

          <p className="text-xs text-emerald-900 dark:text-emerald-300 font-semibold pt-1">
            Everyone can work on the same list instead of sending messages, screenshots, or maintaining separate lists.
          </p>
        </div>
      </section>

      {/* ─── Why SUCHI? ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight">
            Why SUCHI?
          </h2>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Three principles guiding every interaction
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {whyPillars.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900/90 rounded-2xl p-5 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-2.5"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Creator Section ────────────────────────────────────────── */}
      <section className="bg-white dark:bg-slate-900/90 rounded-3xl p-6 sm:p-8 border border-emerald-100 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center space-x-2">
          <Code2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] uppercase tracking-wider font-bold text-gray-500 dark:text-slate-400">
            Created & Coded by
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
          Akash Kamal
        </h3>

        <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-300 leading-relaxed max-w-2xl font-normal">
          SUCHI is independently designed and developed by <strong>Akash Kamal</strong>, combining a focused user experience with modern web technologies to create a practical tool for everyday life.
        </p>

        {onNavigate && (
          <div className="pt-2">
            <button
              onClick={() => onNavigate('/')}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Back to Grocery Planner</span>
            </button>
          </div>
        )}
      </section>

      {/* ─── Footer Closing Statement ───────────────────────────────── */}
      <footer className="text-center pt-4 pb-2 space-y-2 border-t border-gray-100 dark:border-slate-800">
        <p className="text-sm sm:text-base font-black text-emerald-800 dark:text-emerald-300 tracking-tight">
          Plan better. Shop together. Stay organized.
        </p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500">
          © 2026 SUCHI. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
