"use client";

import { useEffect } from "react";

/**
 * Drives every `data-reveal` marker on the page with one IntersectionObserver.
 *
 * A single observer for the whole document replaces one observer (and one
 * animation component) per revealed section. It is mounted from the route
 * template, so it re-scans after each navigation.
 *
 * Elements inside a `[data-reveal-group]` are deliberately not observed on
 * their own — the group reveals as a unit and CSS staggers the children, so
 * they can't fire out of order.
 */
export function RevealObserver() {
  useEffect(() => {
    const reveal = (el: Element) => el.setAttribute("data-shown", "");

    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll("[data-reveal],[data-reveal-group]").forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          // One-shot: nothing re-hides, so stop paying for it.
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -60px 0px" }
    );

    const scan = () => {
      document.querySelectorAll("[data-reveal],[data-reveal-group]").forEach((el) => {
        if (el.hasAttribute("data-shown")) return;
        // Children of a group are revealed by the group.
        if (!el.hasAttribute("data-reveal-group") && el.closest("[data-reveal-group]")) return;
        observer.observe(el);
      });
    };
    scan();

    // Sections that stream in after the first paint still need picking up.
    const mutations = new MutationObserver(scan);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
