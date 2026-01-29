# This ng-app is an angular app.
- Code styles
  - 2 spaces indents
  - components should be standalone by default
  - default change detection strategy should be OnPush
  - use signals by default to store components' internal states
  - when necessary, use rxjs to handle input streams such as mouse move/click, keydown/keyup events etc.
  - wrap complicated logic into services and inject them via DI, prefer field DI over constructor DI.
  ```typescript
  readonly serviceField = inject(ServiceClass);
  ```
  
  