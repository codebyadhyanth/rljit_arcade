# RLJIT Arcade Web Portal — Visual Design Specification

> **Platform:** Web Desktop & Responsive Browser Portal  
> **Source Visual DNA:** CampusHub Warm-Neutral Bento Aesthetic (Reference Image)  
> **Styling Framework:** Tailwind CSS 3.4+ & CSS Variables  
> **Design Philosophy:** Institutional Authority, Clean Hairlines, Warm Natural Contrast, Zero Neon Fluff  

---

## 1. Master Color Tokens

All colors in the web portal derive from the warm-neutral, high-contrast palette of the reference design. Neon tones and saturated primary blues/purples are strictly prohibited.

| Token Key | Hex Value | Semantic Role | Tailwind Utility Equivalent |
| :--- | :--- | :--- | :--- |
| **`canvas-bg`** | `#F4F4F6` | Default page background | `bg-[#F4F4F6]` or `bg-zinc-100/70` |
| **`surface-card`** | `#FFFFFF` | Primary card & container surface | `bg-white` |
| **`surface-dark`** | `#121214` | High-contrast dark cards, hero panels, dark buttons | `bg-[#121214]` or `bg-zinc-950` |
| **`surface-dark-subtle`**| `#1C1C1F` | Elevated sub-elements on dark surfaces | `bg-[#1C1C1F]` |
| **`hairline-border`**| `#EBEBEF` | Subtle borders for cards and dividers | `border-[#EBEBEF]` |
| **`hairline-border-dark`**| `rgba(255, 255, 255, 0.08)` | Subtle border on dark surfaces | `border-white/10` |
| **`brand-orange`** | `#EA580C` | Primary brand accent, primary highlights, active badges | `bg-orange-600`, `text-orange-600` |
| **`brand-orange-hover`**| `#C2410C` | Button hover state | `hover:bg-orange-700` |
| **`brand-orange-light`**| `#FFF7ED` | Orange badge background, alert background | `bg-orange-50` |
| **`status-emerald`** | `#10B981` | Success indicators, verified DB badges | `text-emerald-600`, `bg-emerald-500` |
| **`status-emerald-bg`**| `#ECFDF5` | Success banner background | `bg-emerald-50` |
| **`status-rose`** | `#EF4444` | Error banners, invalid credential badges | `text-rose-600`, `bg-rose-50` |
| **`status-amber`** | `#F59E0B` | Warning banners, rate limit notices | `text-amber-600`, `bg-amber-50` |
| **`text-primary`** | `#09090B` | Page titles, primary headings, emphasized text | `text-zinc-900` |
| **`text-body`** | `#27272A` | Standard paragraphs, form labels | `text-zinc-800` |
| **`text-muted`** | `#71717A` | Placeholder text, secondary captions, metadata | `text-zinc-500` |
| **`text-inverse`** | `#FFFFFF` | Text rendered on dark surfaces | `text-white` |

---

## 2. Geometry, Spacing & Border Radius

The reference aesthetic uses soft, modern squircle geometry:

| Component Type | Border Radius | Tailwind Class | Pixel Value |
| :--- | :--- | :--- | :--- |
| **Outer Page Cards** | Extra Large Squircle | `rounded-3xl` | `24px` |
| **Standard Cards / Modals** | Large Squircle | `rounded-2xl` | `16px` |
| **Inputs & Form Controls** | Medium Squircle | `rounded-xl` | `12px` |
| **Buttons (Primary/Action)**| Full Pill or Medium Squircle | `rounded-full` or `rounded-xl` | `9999px` / `12px` |
| **Status Badges / Tags** | Pill or Small Squircle | `rounded-full` or `rounded-lg` | `9999px` / `8px` |

### Spacing Scale
- Page container padding: `p-6` (24px) or `p-8` (32px) on desktop (`lg:p-12`).
- Card internal padding: `p-6` (24px) for desktop; `p-5` (20px) for compact viewports.
- Stack gaps: Form elements use `space-y-4` (16px) or `gap-4`. Group headers use `mb-2` (8px).

---

## 3. Elevation & Shadows

Harsh drop shadows and bright neon glows are strictly banned. All surfaces use diffused micro-elevations:

```css
/* Card Elevation */
box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
```

Tailwind utility formulation:
```html
<div className="bg-white border border-[#EBEBEF] rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
  ...
</div>
```

---

## 4. UI Component Blueprints

### A. Form Inputs
- **Base State:**
  ```html
  <input
    className="w-full px-4 py-3 bg-[#FBFBFC] border border-[#EBEBEF] rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 transition-all duration-200 outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10"
  />
  ```
- **Error State:**
  ```html
  <input
    className="w-full px-4 py-3 bg-rose-50/30 border border-rose-300 rounded-xl text-sm text-zinc-900 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10"
  />
  ```

### B. Action Buttons
- **Primary Obsidian Action (Reference Style):**
  ```html
  <button
    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#121214] hover:bg-black text-white text-sm font-semibold rounded-xl shadow-sm transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <span>Sign In</span>
  </button>
  ```
- **Primary Brand Orange Action:**
  ```html
  <button
    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-sm font-semibold rounded-full shadow-sm transition-all duration-150 active:scale-[0.99]"
  >
    <span>Proceed</span>
  </button>
  ```
- **Secondary Ghost Action:**
  ```html
  <button
    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-transparent hover:bg-zinc-100 text-zinc-700 text-sm font-medium rounded-xl border border-[#EBEBEF] transition"
  >
    <span>Cancel</span>
  </button>
  ```

### C. Alert & Notification Banners
- **Error Banner:**
  ```html
  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs leading-relaxed">
    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
    <span className="font-medium">{errorMessage}</span>
  </div>
  ```
- **Live Database Receipt Banner:**
  ```html
  <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-800">
    <div className="flex items-center gap-2 font-medium">
      <ShieldCheck className="w-4 h-4 text-emerald-600" />
      <span>PostgreSQL Atomic Persistence Confirmed</span>
    </div>
    <span className="font-mono text-[11px] bg-emerald-100/70 px-2 py-0.5 rounded text-emerald-900">
      xmin: {pgTransactionId}
    </span>
  </div>
  ```

---

## 5. Typography Hierarchy

- **Font Family:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Headings (H1):** `text-2xl font-bold tracking-tight text-zinc-900`
- **Section Titles (H2):** `text-lg font-semibold tracking-tight text-zinc-900`
- **Card Subheaders (H3):** `text-sm font-semibold text-zinc-800`
- **Body Text:** `text-sm font-normal text-zinc-700 leading-normal`
- **Captions & Labels:** `text-xs font-medium text-zinc-500 uppercase tracking-wider`
- **Technical & Cryptographic Values:** `font-mono text-xs tracking-tight text-zinc-800`

