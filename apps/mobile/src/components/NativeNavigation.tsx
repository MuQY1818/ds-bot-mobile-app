import React, { createContext, useContext, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef, CommonActions, StackActions, useIsFocused } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { Route } from '../logic/app-navigation';
import { ScreenActivity } from './ScreenActivity';

type Pages = { Page: { destination: Route } };
const Stack = createNativeStackNavigator<Pages>();
type Render = (route: Route, focused: boolean) => React.ReactNode;
const PageContent = createContext<Render>(() => null);
function Page({ route }: NativeStackScreenProps<Pages, 'Page'>) {
  const render = useContext(PageContent);
  const focused = useIsFocused();
  return <ScreenActivity.Provider value={focused}>{render(route.params.destination, focused)}</ScreenActivity.Provider>;
}

export function createAppNavigator() {
  const ref = createNavigationContainerRef<Pages>();
  return {
    ref,
    open(destination: Route) {
      if (!ref.isReady()) return;
      const state = ref.getRootState();
      if (!state) return;
      if (destination.page === 'home') { ref.dispatch(StackActions.popToTop()); return; }
      // A single retained chat owns the draft and stream even when its details are open.
      if (destination.page === 'chat') {
        const index = state.routes.findIndex(item => (item.params as Pages['Page'] | undefined)?.destination.page === 'chat');
        if (index >= 0) {
          const previous = (state.routes[index].params as Pages['Page']).destination;
          if (previous.page === 'chat' && previous.id !== destination.id && index < state.index) {
            const routes = state.routes.filter((_, position) => position !== index);
            ref.dispatch(CommonActions.reset({
              ...state, index: routes.length,
              routes: [...routes, { name: 'Page', params: { destination } }],
            }));
          } else {
            ref.dispatch({ ...CommonActions.setParams({ destination }), source: state.routes[index].key });
            const count = state.index - index;
            if (count > 0) ref.dispatch(StackActions.pop(count));
          }
          return;
        }
      }
      const current = (state.routes[state.index].params as Pages['Page']).destination;
      if (current.page === 'team' && current.create && destination.page === 'chat') {
        ref.dispatch(StackActions.replace('Page', { destination }));
        return;
      }
      const key = (route: Route) => {
        if (route.page === 'settings') return `settings:${route.initial || 'index'}`;
        if (route.page === 'team') {
          const page = route.subpage || (route.id ? (route.section === 'groups' ? 'group' : 'bot') : 'list');
          return `team:${route.section}:${page}:${page === 'list' ? '' : route.id || ''}:${route.create || ''}`;
        }
        return JSON.stringify(route);
      };
      if (key(current) === key(destination)) return;
      const returning = (destination.page === 'team' && ['list', 'bot', 'group'].includes(destination.subpage || ''))
        || (destination.page === 'settings' && destination.initial === 'index');
      const index = returning ? state.routes.findIndex(item => key((item.params as Pages['Page']).destination) === key(destination)) : -1;
      if (index >= 0) {
        const count = state.index - index;
        if (count > 0) ref.dispatch(StackActions.pop(count));
      } else ref.dispatch(StackActions.push('Page', { destination }));
    },
    back() { if (ref.isReady() && ref.canGoBack()) ref.goBack(); },
  };
}
export type AppNavigator = ReturnType<typeof createAppNavigator>;

export function NativeNavigation({ navigator, onRoute, render }: { navigator: AppNavigator; onRoute: (route: Route) => void; render: Render }) {
  const t = useTheme();
  const initial = useRef({ destination: { page: 'home' } as Route }).current;
  return <PageContent.Provider value={render}>
    <NavigationContainer ref={navigator.ref} onStateChange={state => {
      const page = state?.routes[state.index ?? 0];
      if (page?.params) onRoute((page.params as Pages['Page']).destination);
    }}>
      <Stack.Navigator screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.bg },
        animation: 'simple_push',
        animationMatchesGesture: true,
        animationDuration: 280,
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        freezeOnBlur: false,
      }}>
        <Stack.Screen name="Page" component={Page} initialParams={initial} options={({ route }) => ({
          gestureEnabled: !(route.params.destination.page === "team" && route.params.destination.create),
        })}/>
      </Stack.Navigator>
    </NavigationContainer>
  </PageContent.Provider>;
}
