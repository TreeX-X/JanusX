import { configService } from '../config/service'

// Note: switches govern behavior as well as entry visibility — see .agents/notes/knowledge/memory-domain-controls.md
export async function memoryDomainPolicy() {
  const [features, personal] = await Promise.all([
    configService.getExperimentalFeatures(), configService.getPersonalMemorySettings(),
  ])
  return {
    project: false,
    personal: features.persona,
    capturePersonal: features.persona && personal.captureConversations,
    inferEngineeringHabits: features.persona && personal.inferEngineeringHabits,
    recallPersonal: features.persona && personal.useInChat,
    episodeTtlDays: personal.episodeTtlDays,
  }
}
