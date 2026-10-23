# Component Map

The shared surfaces this system needs. Specified once, referenced everywhere —
this is both the design-system contract and the implementation checklist.

**14 components required · 8 worth generating · 58 variants in play**

## Data

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Chart Panel** | 2 | line, bar, area, donut, loading, empty | ✓ | `components/charts/ChartPanel` |
| **Stat Card** | 2 | default, with-trend, with-sparkline, loading, error | ✓ | `components/ui/StatCard` |

## Feedback

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Inline Alert / Banner** | 4 | info, warning, error, success, dismissible, with-action | — | `components/ui/Alert` |
| **Toast Stack** | 4 | success, warning, info, with-undo, stacked | ✓ | `components/ui/Toast` |
| **Confirmation Dialog** | 2 | default, destructive, typed-confirm, with-consequences | ✓ | `components/ui/ConfirmDialog` |
| **Empty State** | 2 | first-run, filtered-out, error | ✓ | `components/ui/EmptyState` |
| **Loading Skeleton** | 2 | card-grid | ✓ | `components/ui/Skeleton` |

## Input

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Date Range Picker** | 2 | presets, custom-calendar | — | `components/ui/DateRangePicker` |
| **Form Field Set** | 2 | default, error, disabled, with-help, required, loading | ✓ | `components/ui/form` |
| **Search Input** | 2 | default, focused, with-results, no-results | — | `components/ui/SearchInput` |

## Layout

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Navigation Shell** | 4 | expanded, collapsed, mobile-drawer | ✓ | `components/layout/AppShell` |
| **Page Header** | 4 | with-actions, with-tabs, with-breadcrumb, minimal | — | `components/layout/PageHeader` |

## Navigation

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Tab Bar** | 2 | underline, pill, with-counts | — | `components/ui/Tabs` |

## Overlay

| Component | Used by | Variants | Render | Code path |
|---|---:|---|:---:|---|
| **Modal Shell** | 0 | sm, md, lg, full, with-steps, scrollable-body | — | `components/ui/Dialog` |
