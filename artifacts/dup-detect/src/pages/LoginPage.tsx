import { useQuery } from "@tanstack/react-query";
import { useUser, type SentinelUser } from "@/contexts/UserContext";
import { motion } from "framer-motion";
import { Shield, Loader2, User } from "lucide-react";

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-green-500 to-emerald-600",
  "from-yellow-500 to-orange-600",
  "from-cyan-500 to-sky-600",
  "from-purple-500 to-violet-600",
];

type UserDto = { id: string; username: string; display_name: string };

export default function LoginPage() {
  const { login } = useUser();

  const { data, isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/user-reviews/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json() as Promise<{ users: UserDto[] }>;
    },
  });

  const handleSelect = (u: UserDto) => {
    login({ id: u.id, username: u.username, displayName: u.display_name });
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-3"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-900/40">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sentinel</h1>
          <p className="text-xs text-slate-400 -mt-0.5">Duplicate Payment Detection</p>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.15 } }}
        className="text-slate-400 text-sm mb-10"
      >
        Select your analyst profile to begin
      </motion.p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading analysts…</span>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 max-w-3xl w-full"
        >
          {(data?.users ?? []).map((u, i) => {
            const initials = u.display_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase();
            return (
              <motion.button
                key={u.id}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSelect(u)}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-white/8 bg-white/4 hover:border-violet-500/50 hover:bg-white/8 transition-all cursor-pointer group"
              >
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center shadow-md text-white font-semibold text-sm`}
                >
                  {initials}
                </div>
                <div className="text-center">
                  <p className="text-white text-xs font-medium leading-tight group-hover:text-violet-200 transition-colors">
                    {u.display_name}
                  </p>
                  <p className="text-slate-500 text-[10px] mt-0.5">Analyst</p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.4 } }}
        className="mt-12 text-slate-600 text-xs"
      >
        Internal use only — no password required
      </motion.p>
    </div>
  );
}
