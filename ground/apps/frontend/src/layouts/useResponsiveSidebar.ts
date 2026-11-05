import { onBeforeUnmount, onMounted, ref } from 'vue';

const NARROW_SIDEBAR_QUERY = '(max-width: 960px)';

export function useResponsiveSidebar() {
  const isSidebarCollapsed = ref(false);
  let mediaQuery: MediaQueryList | null = null;

  function collapseOnNarrowViewport(event: MediaQueryListEvent | MediaQueryList) {
    if (event.matches) isSidebarCollapsed.value = true;
  }

  onMounted(() => {
    mediaQuery = window.matchMedia(NARROW_SIDEBAR_QUERY);
    collapseOnNarrowViewport(mediaQuery);
    mediaQuery.addEventListener('change', collapseOnNarrowViewport);
  });

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', collapseOnNarrowViewport);
  });

  return { isSidebarCollapsed };
}
