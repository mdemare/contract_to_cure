# PLAN-18: Display Current Git Commit in Header

## Issue Summary
Add the current git commit hash (first 6 characters) to the header when running in production environment. The display should be inconspicuous.

## Implementation Plan

### 1. Modify the Header HTML
- Edit `/app/views/application/index.html.erb`
- Add a span element with class "git-hash" inside the header
- Use ERB to conditionally display only in production
- Read from `.git/refs/heads/trunk` file to get the commit hash
- Display only the first 6 characters

### 2. Style the Git Hash Display
- Add CSS rules to make the display inconspicuous
- Use muted colors and smaller font size
- Position it appropriately in the header

### 3. Implementation Details
- Add the git hash display after the logo container or before the auth container
- Use Rails.env.production? to check environment
- Handle potential file read errors gracefully
- Consider caching the value to avoid repeated file reads

### 4. Testing
- Test in development environment (should not display)
- Verify production environment behavior
- Ensure no errors if git file is not accessible
- Check responsive design compatibility

## Code Location
- Primary file to modify: `/app/views/application/index.html.erb`
- May need to add CSS to `/public/css/style.css` or create a new CSS file