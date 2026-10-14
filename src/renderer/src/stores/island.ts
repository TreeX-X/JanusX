import { create } from 'zustand'
import {
  INITIAL_ISLAND_CONTROLLER_STATE,
  reduceIslandController,
  type IslandControllerAction,
  type IslandControllerState,
} from '../components/janus/islandController'

interface IslandStore {
  stage: IslandControllerState['stage']
  knowledge: IslandControllerState['knowledge']
  dispatch: (action: IslandControllerAction) => void
}

/** The capsule/peek/expanded stage lives here instead of inside the Titlebar so
 *  surfaces outside it — the memo panel above all — can follow the island
 *  without prop drilling. The reducer stays the single source of transitions. */
export const useIslandStore = create<IslandStore>()((set) => ({
  ...INITIAL_ISLAND_CONTROLLER_STATE,
  dispatch: (action) => set((current) => reduceIslandController(
    { stage: current.stage, knowledge: current.knowledge },
    action,
  )),
}))
