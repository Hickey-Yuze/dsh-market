/**
 * Styles for the market pages.
 *
 * The class names are plain and local to the client half. The page follows
 * the host's list conventions (hairline-separated rows, muted metadata) and
 * adds the installed-plugin grid, the manual-install source card and the
 * small icon buttons that the host does not ship.
 */

export const styles = `
.dsm-page {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 32px;
  color: var(--dsw-alias-label-primary);
}
.dsm-pageHead {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.dsm-pageIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
}
.dsm-pageTitle {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
.dsm-panel {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-bottom: 8px;
}
.dsm-tabs {
  flex: none;
  max-width: 420px;
}
.dsm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.dsm-search {
  width: 320px;
  max-width: 100%;
}
.dsm-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
}
.dsm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsm-card {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 8px;
  min-width: 0;
  border-radius: var(--dsw-radius-xl);
}
.dsm-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsm-cardMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsm-cardTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsm-cardDesc {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 18px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsm-cardMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 16px;
}
.dsm-cardPath {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}
.dsm-cardEnd {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsm-icon {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: none;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg);
  color: var(--dsw-alias-label-secondary);
}
.dsm-empty {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.dsm-error {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.dsm-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}

/* Manual install: source picker */
.dsm-manual {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: none;
}
.dsm-sourceTabs {
  max-width: 360px;
  align-self: center;
}
.dsm-sourceCard {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-bg-layer-1);
}
.dsm-sourceIcon {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: none;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-lg);
  color: var(--dsw-alias-label-secondary);
}
.dsm-sourceMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsm-sourceTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
.dsm-sourceValue {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsm-sourceFields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.dsm-sourceInput {
  width: 280px;
  max-width: 100%;
}
.dsm-fileInput {
  display: none;
}
.dsm-manualFooter {
  display: flex;
  justify-content: flex-end;
  flex: none;
}

/* Installed plugins: two-column card grid */
.dsm-installedGrid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.dsm-installedCard {
  box-sizing: border-box;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0;
}
.dsm-installedHead {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.dsm-installedIcon {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsm-installedTitle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsm-installedName {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsm-installedMeta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsm-installedVersion {
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 16px;
}
.dsm-installedActions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dsm-installedDesc {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsm-iconButton {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsm-iconButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsm-iconButton:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsm-iconButtonDanger:hover:not(:disabled) {
  color: var(--dsw-alias-label-danger);
}
`
