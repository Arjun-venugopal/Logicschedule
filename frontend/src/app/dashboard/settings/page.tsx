"use client";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-400 text-sm mt-0.5">Manage your account and application preferences</p>
      </div>

      <div className="grid gap-4">
        {/* Profile Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">Admin Profile</h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl brand-gradient flex items-center justify-center text-2xl font-bold text-black">
              A
            </div>
            <div>
              <p className="font-medium text-white">System Administrator</p>
              <p className="text-sm text-neutral-400">admin@school.edu</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label: "Full Name", placeholder: "Admin Name" },
              { label: "Email", placeholder: "admin@school.edu", type: "email" },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">{f.label}</label>
                <input
                  type={f.type || "text"}
                  placeholder={f.placeholder}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-neutral-600"
                />
              </div>
            ))}
          </div>
          <button className="mt-4 px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
            Save Changes
          </button>
        </div>

        {/* Change Password */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">Change Password</h3>
          <div className="space-y-3 max-w-md">
            {["Current Password", "New Password", "Confirm New Password"].map((label) => (
              <div key={label}>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">{label}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-neutral-600"
                />
              </div>
            ))}
            <button className="px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
              Update Password
            </button>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">System Information</h3>
          <div className="space-y-3">
            {[
              { label: "Application", value: "Schedulix v1.0" },
              { label: "Backend API", value: "http://localhost:5000" },
              { label: "Database", value: "MongoDB" },
              { label: "Environment", value: "Development" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-2.5 border-b border-neutral-800 last:border-0">
                <span className="text-sm text-neutral-400">{item.label}</span>
                <span className="text-sm text-white font-medium font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
