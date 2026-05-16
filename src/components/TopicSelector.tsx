"use client";

export type TopicId =
  | "frontend_interview"
  | "free_talk"
  | "daily_english"
  | "daily_challenge_api_yesterday";

export type TopicOption = {
  id: TopicId;
  label: string;
  description: string;
};

type TopicSelectorProps = {
  topics: TopicOption[];
  selectedTopic: TopicId;
  onSelect: (topic: TopicId) => void;
};

export default function TopicSelector({
  topics,
  selectedTopic,
  onSelect,
}: TopicSelectorProps) {
  return (
    <section className="w-full rounded-2xl border-2 border-zinc-200 bg-white p-4">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-zinc-900">
          Choose your topic
        </h2>
        <p className="text-sm text-zinc-600">
          Pick one mode and start practicing your English.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {topics.map((topic) => {
          const isActive = topic.id === selectedTopic;

          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => onSelect(topic.id)}
              className={`rounded-xl border p-4 text-left transition ${
                isActive
                  ? "border-[#58cc02] bg-[#f1ffe8] ring-2 ring-[#58cc02]/30"
                  : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"
              }`}
              aria-pressed={isActive}
            >
              <p className="font-semibold text-zinc-900">
                {topic.label}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {topic.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
