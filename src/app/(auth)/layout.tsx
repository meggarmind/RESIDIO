import { Building2 } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Login Form */}
      <div className="w-full lg:w-[40%] flex flex-col items-center justify-center bg-background p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold tracking-tight">Residio</span>
          </div>

          {/* Form Content */}
          {children}
        </div>
      </div>

      {/* Right Panel - Hero/Marketing Section */}
      <div className="hidden lg:flex lg:w-[60%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(100,116,139,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(148,163,184,0.08),transparent_50%)]" />

        <div className="relative z-10 max-w-xl text-center space-y-8">
          {/* Main Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-light tracking-tight">
              Resident Engagement,
              <span className="block font-normal">Simplified</span>
            </h1>
            <div className="h-1 w-24 bg-white/30 mx-auto rounded-full" />
          </div>

          {/* Subheading */}
          <p className="text-lg text-slate-300 leading-relaxed">
            Manage payments, security access, and community communication all in one place.
            Built for modern residential estates.
          </p>

          {/* Feature highlights */}
          <div className="grid grid-cols-2 gap-4 mt-8 text-left">
            <FeatureItem
              title="Payment Tracking"
              description="Automated levy management and payment status"
            />
            <FeatureItem
              title="Security Access"
              description="Digital contact lists and access codes"
            />
            <FeatureItem
              title="Announcements"
              description="Community-wide broadcast system"
            />
            <FeatureItem
              title="Resident Portal"
              description="Self-service for residents"
            />
          </div>

          {/* Decorative laptop mockup placeholder */}
          <div className="mt-12 relative">
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-xl p-4 shadow-2xl border border-slate-600/30">
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex gap-1.5 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-600/50 rounded w-3/4" />
                  <div className="h-3 bg-slate-600/50 rounded w-1/2" />
                  <div className="h-3 bg-slate-600/50 rounded w-2/3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white/5 rounded-lg p-4 backdrop-blur-sm border border-white/10">
      <h3 className="font-medium text-sm text-white">{title}</h3>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </div>
  );
}
