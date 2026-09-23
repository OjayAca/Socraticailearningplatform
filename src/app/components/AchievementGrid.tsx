import { Award, Flame, Footprints, Star } from "lucide-react";
import type { AchievementAward, AchievementId } from "@mindguide/contracts";

const ORDER: Array<{ id: AchievementId; title: string; description: string; Icon: typeof Award }> = [
  { id: "first_step", title: "First Step", description: "Complete your first learning session.", Icon: Footprints },
  { id: "dedicated_learner", title: "Dedicated Learner", description: "Complete five learning sessions.", Icon: Award },
  { id: "three_day_streak", title: "Three-Day Streak", description: "Learn on three consecutive days.", Icon: Flame },
  { id: "strong_reasoner", title: "Strong Reasoner", description: "Earn a scorecard total of 80 or higher.", Icon: Star },
];

export function AchievementGrid({ achievements }: { achievements?: Partial<Record<AchievementId, AchievementAward>> }) {
  return (
    <section id="achievements" aria-label="Achievements" className="scroll-mt-6">
      <h2 className="text-xl font-bold text-slate-950 dark:text-white">Achievements</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map(({ id, title, description, Icon }) => {
          const award = achievements?.[id];
          return (
            <div key={id} className={`rounded-2xl border p-4 ${award ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900"}`}>
              <Icon className={`h-6 w-6 ${award ? "text-amber-600" : "text-slate-400"}`} />
              <h3 className="mt-3 font-bold text-slate-950 dark:text-white">{title}</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">{award ? "Earned" : "Not yet earned"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
