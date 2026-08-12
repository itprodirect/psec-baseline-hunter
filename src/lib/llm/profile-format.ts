import {
  CONTEXT_FACTOR_LABELS,
  PROFESSION_LABELS,
  type UserProfile,
} from "@/lib/types/userProfile";

const TECHNICAL_STYLE: Record<UserProfile["technicalLevel"], string> = {
  "non-technical": "plain language",
  "some-technical": "plain language with basic technical terms",
  technical: "technical operations language",
  "security-professional": "concise security terminology",
};

const TONE_STYLE: Record<UserProfile["tone"], string> = {
  reassuring: "calm and action-oriented",
  direct: "direct",
  urgent: "priority-focused",
  educational: "educational",
};

/**
 * Describe deterministic presentation preferences without treating a user
 * profile as security evidence or allowing it to strengthen a conclusion.
 */
export function renderProfileFormattingNote(profile: UserProfile): string {
  const context = profile.contextFactors
    .map((factor) => CONTEXT_FACTOR_LABELS[factor].label)
    .join(", ");
  return `Presentation context (not evidence): ${TECHNICAL_STYLE[profile.technicalLevel]}, ${TONE_STYLE[profile.tone]}; intended role: ${PROFESSION_LABELS[profile.profession].label}; selected context: ${context || "none"}. These settings do not change the evidence or supported conclusions.`;
}
