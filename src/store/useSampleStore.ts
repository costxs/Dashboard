import { useMemo } from "react";
import { create } from "zustand";
import type { LithoType, ProjectPartner, Sample, SampleStatus } from "../types";
import { samples } from "../data/samples";

export interface SampleFilters {
  searchQuery: string;
  lithoType: LithoType | "Todos";
  project: ProjectPartner | "Todos";
  status: SampleStatus | "Todos";
  minPermeability: number;
  maxPermeability: number;
}

interface SampleStoreState {
  activeProject: ProjectPartner;
  setActiveProject: (project: ProjectPartner) => void;
  samples: Sample[];
  filters: SampleFilters;
  setSearchQuery: (query: string) => void;
  setFilter: <K extends keyof SampleFilters>(
    key: K,
    value: SampleFilters[K]
  ) => void;
  resetFilters: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export function filterSamples(all: Sample[], filters: SampleFilters): Sample[] {
  const q = filters.searchQuery.trim().toLowerCase();

  return all.filter((sample) => {
    const matchesQuery =
      q.length === 0 ||
      sample.code.toLowerCase().includes(q) ||
      sample.name.toLowerCase().includes(q) ||
      sample.lithoType.toLowerCase().includes(q) ||
      sample.well?.toLowerCase().includes(q) ||
      sample.tags.some((tag) => tag.toLowerCase().includes(q));

    const matchesLitho =
      filters.lithoType === "Todos" || sample.lithoType === filters.lithoType;
    const matchesProject =
      filters.project === "Todos" || sample.project === filters.project;
    const matchesStatus =
      filters.status === "Todos" || sample.status === filters.status;
    const matchesPermeability =
      sample.permeabilityInitialMd >= filters.minPermeability &&
      sample.permeabilityInitialMd <= filters.maxPermeability;

    return (
      matchesQuery &&
      matchesLitho &&
      matchesProject &&
      matchesStatus &&
      matchesPermeability
    );
  });
}

const defaultFilters: SampleFilters = {
  searchQuery: "",
  lithoType: "Todos",
  project: "Todos",
  status: "Todos",
  minPermeability: 0,
  maxPermeability: 5000,
};

export const useSampleStore = create<SampleStoreState>((set) => ({
  activeProject: "TotalEnergies",
  setActiveProject: (project) =>
    set((state) => ({
      activeProject: project,
      filters: { ...state.filters, project: project },
    })),
  samples,
  filters: { ...defaultFilters, project: "TotalEnergies" },
  setSearchQuery: (query) =>
    set((state) => ({ filters: { ...state.filters, searchQuery: query } })),
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () =>
    set((state) => ({
      filters: { ...defaultFilters, project: state.activeProject },
    })),
  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));

/** Seleciona `samples`/`filters` do store e memoiza a lista filtrada. */
export function useFilteredSamples(): Sample[] {
  const all = useSampleStore((s) => s.samples);
  const filters = useSampleStore((s) => s.filters);
  return useMemo(() => filterSamples(all, filters), [all, filters]);
}
