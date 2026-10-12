import assert from "node:assert/strict";
import test from "node:test";
import { containDialogFocus } from "../lib/studio-dialog-focus";

// A small DOM double exercises event ownership and ordering. Actual React
// mounting, CSS visibility, typing and keyboard traversal are also browser QA.
function fixture() {
  const document = Object.assign(new EventTarget(), { activeElement: null as Element | null });
  class Element {
    tabIndex = 0;
    isConnected = true;
    isContentEditable = false;
    hidden = false;
    disabled = false;
    children: Element[] = [];
    focus() { document.activeElement = this; }
    contains(element: Element | null): boolean {
      return this === element || this.children.some((child) => child.contains(element));
    }
    querySelectorAll() { return this.children; }
    matches() { return this.disabled; }
    closest() { return null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    getAttribute() { return null; }
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true, value: () => ({ visibility: "visible" }),
  });
  const key = (key: string, shiftKey = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key, shiftKey });
    document.dispatchEvent(event);
    return event;
  };
  const open = (element: Element, close: () => void = () => {}) =>
    containDialogFocus(element as unknown as HTMLElement, close);
  return { document, Element, key, open };
}

test("Tab starts inside the dialog and wraps around visible enabled controls", () => {
  const { document, Element, key, open } = fixture();
  const trigger = new Element(); trigger.focus();
  const panel = new Element();
  const hidden = new Element(); hidden.hidden = true;
  const first = new Element();
  const disabled = new Element(); disabled.disabled = true;
  const last = new Element();
  panel.children = [hidden, first, disabled, last];
  const close = open(panel);
  assert.equal(document.activeElement, panel);
  assert.equal(key("Tab", true).defaultPrevented, true);
  assert.equal(document.activeElement, last, "reverse Tab from panel stays inside");
  key("Tab");
  assert.equal(document.activeElement, first, "hidden handle is not the wrap target");
  key("Tab", true);
  assert.equal(document.activeElement, last);
  close();
  assert.equal(document.activeElement, trigger);
});

test("nested Escape closes only the top dialog and restores its parent control", () => {
  const { document, Element, key, open } = fixture();
  const parent = new Element();
  const trigger = new Element(); parent.children = [trigger];
  let parentCloses = 0, childCloses = 0;
  const closeParent = open(parent, () => parentCloses++);
  trigger.focus();
  const child = new Element();
  const closeChild = open(child, () => childCloses++);
  key("Escape");
  assert.equal(childCloses, 1);
  assert.equal(parentCloses, 0);
  closeChild();
  assert.equal(document.activeElement, trigger);
  key("Escape");
  assert.equal(parentCloses, 1);
  closeParent();
});

test("empty dialogs contain Tab and disconnected triggers are not restored", () => {
  const { document, Element, key, open } = fixture();
  const trigger = new Element(); trigger.focus();
  const panel = new Element();
  const close = open(panel);
  trigger.isConnected = false;
  key("Tab");
  assert.equal(document.activeElement, panel);
  close();
  assert.equal(document.activeElement, panel);
});
