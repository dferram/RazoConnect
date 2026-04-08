# Instructional Banners Implementation Guide

## Purpose

Instructional banners give users a short page-specific explanation when they open an admin or agent screen.

The banner is intentionally temporary: it closes for the current view, but it reappears on the next page load.

## Behavior

- The banner appears automatically when the page loads.
- The close button hides it for the current session view.
- The banner does not use `localStorage`.
- Each page can define its own message.

## Implementation Files

- `tenants_views/razo/css/admin.css`: banner styling
- `tenants_views/razo/js/instructional-banner.js`: close-button behavior

## Common Structure

```html
<div id="instructionalBanner" class="instructional-banner">
  <p>
    <strong>Page title:</strong> Short explanation of what the page does.
  </p>
  <button class="instructional-banner-close" title="Close">×</button>
</div>
```

## Where It Is Used

The banner is already implemented in the main admin and agent screens, including dashboards, orders, inventory, customers, commissions, and reports.

## How to Add It to a New Page

1. Place the banner inside the page content area.
2. Include `js/instructional-banner.js` before `</body>`.
3. Make sure `css/admin.css` is loaded.

## Design Rules

- Use a consistent visual style across pages.
- Keep the text short and specific.
- Do not persist the closed state.
- Keep the message useful for first-time readers.

## Maintenance

To update a message, edit the banner text directly in the page HTML and keep the wording short.

## Notes

This feature is meant to reduce onboarding friction, not to replace the main documentation.
