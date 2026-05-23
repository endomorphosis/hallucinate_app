/**
 * SwissKnife descriptor launcher for the Hallucinate dashboard shell.
 *
 * The launcher treats descriptor packs as untrusted input: packs are
 * normalized, schema-checked, converted into dashboard registrations, and then
 * routed through the dashboard runtime without starting SwissKnife or any live
 * MCP services.
 */

const APP_CAPABILITY_CONTRACT_VERSION = '1.0.0';
const MCP_UI_PROFILE = 'swissknife.mcp++/ui-profile';
const DEFAULT_LIFECYCLE = Object.freeze([
  'discover',
  'bind',
  'authorize',
  'invoke',
  'stream_updates',
  'recover'
]);

const TEMPLATE_KINDS = new Set([
  'dashboard',
  'explorer',
  'form-wizard',
  'job-console',
  'graph-viewer',
  'auto'
]);

const INTERFACE_TYPES = new Set([
  'dataset',
  'compute',
  'workflow',
  'graph',
  'document',
  'storage',
  'generic'
]);

export class DescriptorPackValidationError extends Error {
  constructor(message, validation) {
    super(message);
    this.name = 'DescriptorPackValidationError';
    this.validation = validation;
  }
}

export class VirtualOSDescriptorLauncher {
  constructor(options = {}) {
    this.options = {
      routeOnInit: true,
      showLaunchButtons: true,
      ...options
    };
    this.element = options.element || options.container || null;
    this.eventBus = options.eventBus || createNoopEventBus();
    this.dashboardRuntime = options.dashboardRuntime || options.runtime || null;
    this.descriptorRuntime = options.descriptorRuntime || null;
    this.packs = new Map();
    this.descriptors = new Map();
    this.registrations = new Map();
    this.routes = new Map();
    this.validationResults = [];
    this.initialized = false;
    this._handleLaunchClick = this._handleLaunchClick.bind(this);
  }

  async init() {
    if (this.initialized) {
      return true;
    }

    if (this.element) {
      this.element.classList?.add('virtual-os-descriptor-launcher');
    }

    const descriptorPacks = this.options.descriptorPacks || this.options.packs || [];
    for (const pack of descriptorPacks) {
      this.consumeDescriptorPack(pack, { route: this.options.routeOnInit });
    }

    this.render();
    this.initialized = true;
    emitEvent(this.eventBus, 'virtual-os-descriptors:ready', this.getState());
    return true;
  }

  consumeDescriptorPack(input, options = {}) {
    const normalizedPack = normalizeSwissKnifeDescriptorPack(input, options);
    const validation = validateSwissKnifeDescriptorPack(normalizedPack);
    this.validationResults.push(validation);

    if (!validation.valid) {
      throw new DescriptorPackValidationError(
        `Invalid SwissKnife descriptor pack "${normalizedPack.id}": ${formatValidationErrors(validation.errors)}`,
        validation
      );
    }

    this.packs.set(normalizedPack.id, normalizedPack);
    const registrations = [];

    normalizedPack.descriptors.forEach((descriptor, index) => {
      const appDescriptor = normalizeAppDescriptor(descriptor, {
        packId: normalizedPack.id,
        sourceRepository: normalizedPack.source_repository,
        descriptorIndex: index
      });
      const registration = appRegistrationFromDescriptor(appDescriptor, {
        packId: normalizedPack.id,
        sourceRepository: normalizedPack.source_repository
      });

      if (this.descriptors.has(registration.appId)) {
        throw new DescriptorPackValidationError(
          `Duplicate SwissKnife descriptor app id: ${registration.appId}`,
          {
            valid: false,
            errors: [{
              path: `descriptors[${index}].meta.id`,
              message: `Duplicate app id: ${registration.appId}`
            }],
            warnings: []
          }
        );
      }

      this.descriptors.set(registration.appId, appDescriptor);
      this.registrations.set(registration.appId, registration);
      registrations.push(registration);

      if (options.route !== false) {
        const route = routeDescriptorToHallucinateRuntime(
          this.dashboardRuntime,
          appDescriptor,
          registration,
          {
            descriptorRuntime: this.descriptorRuntime,
            eventBus: this.eventBus
          }
        );
        this.routes.set(registration.appId, route);
      }
    });

    emitEvent(this.eventBus, 'virtual-os-descriptors:pack-loaded', {
      pack: normalizedPack,
      registrations
    });
    this.render();
    return {
      pack: normalizedPack,
      validation,
      registrations
    };
  }

  loadDescriptorPack(input, options = {}) {
    return this.consumeDescriptorPack(input, options);
  }

  registerDescriptorPack(input, options = {}) {
    return this.consumeDescriptorPack(input, options);
  }

  routeRegisteredDescriptors() {
    const routes = [];
    for (const [appId, descriptor] of this.descriptors.entries()) {
      const registration = this.registrations.get(appId);
      const existingRoute = this.routes.get(appId);
      if (existingRoute?.routed) {
        routes.push(existingRoute);
        continue;
      }
      const route = routeDescriptorToHallucinateRuntime(
        this.dashboardRuntime,
        descriptor,
        registration,
        {
          descriptorRuntime: this.descriptorRuntime,
          eventBus: this.eventBus
        }
      );
      this.routes.set(appId, route);
      routes.push(route);
    }
    return routes;
  }

  getDescriptor(appId) {
    return this.descriptors.get(appId) || null;
  }

  getRegistrations() {
    return Array.from(this.registrations.values());
  }

  getState() {
    return {
      packs: Array.from(this.packs.values()).map((pack) => ({
        id: pack.id,
        version: pack.version,
        source_repository: pack.source_repository,
        service_owner: pack.service_owner,
        descriptor_count: pack.descriptors.length
      })),
      registrations: this.getRegistrations(),
      validationResults: this.validationResults
    };
  }

  launch(appId, options = {}) {
    const descriptor = this.getDescriptor(appId);
    const registration = this.registrations.get(appId);
    if (!descriptor || !registration) {
      throw new Error(`Descriptor app is not registered: ${appId}`);
    }

    let route = this.routes.get(appId);
    if (!route || route.routed === false) {
      route = routeDescriptorToHallucinateRuntime(
        this.dashboardRuntime,
        descriptor,
        registration,
        {
          descriptorRuntime: this.descriptorRuntime,
          eventBus: this.eventBus
        }
      );
      this.routes.set(appId, route);
    }

    const launchResult = launchDescriptorRoute(this.dashboardRuntime, registration, descriptor, options);
    emitEvent(this.eventBus, 'virtual-os-descriptors:launch', {
      appId,
      descriptor,
      registration,
      route,
      launchResult
    });
    return launchResult;
  }

  render() {
    const html = renderVirtualOSDescriptorLauncherHTML(this.getState(), this.options);
    if (this.element) {
      this.element.innerHTML = html;
      this.element.querySelectorAll?.('[data-virtual-os-descriptor-app-id]').forEach((button) => {
        button.addEventListener?.('click', this._handleLaunchClick);
      });
    }
    return html;
  }

  _handleLaunchClick(event) {
    const appId = event?.currentTarget?.dataset?.virtualOsDescriptorAppId;
    if (!appId) {
      return;
    }
    this.launch(appId);
  }
}

export function normalizeSwissKnifeDescriptorPack(input, options = {}) {
  const pack = unwrapDefaultExport(input);
  const descriptors = extractDescriptors(pack);
  const packObject = isObject(pack) && !looksLikeDescriptor(pack) ? pack : {};
  const id = firstString(
    packObject.id,
    packObject.pack_id,
    packObject.packId,
    packObject.name,
    options.id,
    'inline-swissknife-descriptor-pack'
  );

  return {
    id,
    version: firstString(packObject.version, packObject.pack_version, packObject.packVersion, options.version, '0.0.0'),
    source_repository: firstString(
      packObject.source_repository,
      packObject.sourceRepository,
      packObject.repository,
      options.source_repository,
      options.sourceRepository
    ),
    service_owner: firstString(
      packObject.service_owner,
      packObject.serviceOwner,
      packObject.owner,
      options.service_owner,
      options.serviceOwner
    ),
    descriptors,
    required_surfaces: normalizeStringArray(packObject.required_surfaces || packObject.requiredSurfaces),
    backend_bindings: normalizeArray(packObject.backend_bindings || packObject.backendBindings),
    normalized_contracts: normalizeObject(packObject.normalized_contracts || packObject.normalizedContracts),
    metadata: normalizeObject(packObject.metadata)
  };
}

export function validateSwissKnifeDescriptorPack(input) {
  const pack = normalizeSwissKnifeDescriptorPack(input);
  const errors = [];
  const warnings = [];

  if (!isNonEmptyString(pack.id)) {
    pushIssue(errors, 'id', 'Descriptor pack id is required.');
  }
  if (!isNonEmptyString(pack.version)) {
    pushIssue(errors, 'version', 'Descriptor pack version is required.');
  } else if (!isSemver(pack.version)) {
    pushIssue(warnings, 'version', 'Descriptor pack version should be semver.');
  }
  if (!pack.source_repository) {
    pushIssue(warnings, 'source_repository', 'Descriptor pack should declare source_repository.');
  }
  if (!pack.service_owner) {
    pushIssue(warnings, 'service_owner', 'Descriptor pack should declare service_owner.');
  }
  if (!Array.isArray(pack.descriptors) || pack.descriptors.length === 0) {
    pushIssue(errors, 'descriptors', 'Descriptor pack must include at least one descriptor.');
  }

  const appIds = new Set();
  pack.descriptors.forEach((descriptor, index) => {
    const descriptorPath = `descriptors[${index}]`;
    const validation = validateSwissKnifeDescriptor(descriptor);
    for (const error of validation.errors) {
      pushIssue(errors, `${descriptorPath}.${error.path}`, error.message);
    }
    for (const warning of validation.warnings) {
      pushIssue(warnings, `${descriptorPath}.${warning.path}`, warning.message);
    }

    if (validation.valid) {
      const appDescriptor = normalizeAppDescriptor(descriptor, {
        packId: pack.id,
        descriptorIndex: index
      });
      const appId = appDescriptor.meta.id;
      if (appIds.has(appId)) {
        pushIssue(errors, `${descriptorPath}.meta.id`, `Duplicate app id: ${appId}.`);
      }
      appIds.add(appId);
    }
  });

  validateBackendBindings(pack, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateSwissKnifeDescriptor(descriptor) {
  if (isMCPUIProfileDescriptor(descriptor)) {
    return validateMCPUIProfileDescriptor(descriptor);
  }
  return validateAppCapabilityDescriptor(descriptor);
}

export function normalizeAppDescriptor(descriptor, context = {}) {
  if (isMCPUIProfileDescriptor(descriptor)) {
    return mcpUIProfileToAppDescriptor(descriptor, context);
  }
  return cloneDescriptor(descriptor);
}

export function appRegistrationFromDescriptor(descriptor, context = {}) {
  const appId = String(descriptor.meta.id);
  const title = firstString(descriptor.ui?.window?.title, descriptor.meta.name, appId);
  const packId = context.packId || descriptor.metadata?.packId || null;
  const panelId = `descriptor-${slugify(appId)}`;
  return {
    appId,
    id: appId,
    panelId,
    name: title,
    title,
    icon: firstString(descriptor.ui?.window?.icon, 'app'),
    component: 'DescriptorAppComponent',
    singleton: descriptor.ui?.window?.singleton ?? true,
    descriptorApp: true,
    packId,
    sourceRepository: context.sourceRepository || descriptor.metadata?.sourceRepository || null,
    services: normalizeArray(descriptor.services).map((service) => service.name).filter(Boolean),
    route: {
      runtime: 'hallucinate-dashboard',
      panelId,
      component: 'DescriptorAppComponent'
    }
  };
}

export function routeDescriptorToHallucinateRuntime(runtime, descriptor, registration, options = {}) {
  if (!runtime) {
    return {
      routed: false,
      reason: 'dashboard runtime unavailable',
      registration
    };
  }

  const payload = {
    descriptor,
    registration,
    appId: registration.appId,
    panelId: registration.panelId
  };

  for (const methodName of [
    'registerDescriptorApp',
    'registerSwissKnifeDescriptorApp',
    'registerVirtualOSDescriptorApp',
    'registerAppDescriptor'
  ]) {
    if (typeof runtime[methodName] === 'function') {
      const result = runtime[methodName](payload);
      return { routed: true, method: methodName, result, registration };
    }
  }

  const panel = createDescriptorPanel(descriptor, registration, options);
  if (typeof runtime.addPanel === 'function') {
    const result = runtime.addPanel(panel);
    return { routed: true, method: 'addPanel', panel, result, registration };
  }

  if (typeof runtime.registerPanel === 'function') {
    const result = runtime.registerPanel(panel);
    return { routed: true, method: 'registerPanel', panel, result, registration };
  }

  if (Array.isArray(runtime.panels)) {
    runtime.panels.push(panel);
    return { routed: true, method: 'panels.push', panel, registration };
  }

  return {
    routed: false,
    reason: 'dashboard runtime does not expose a descriptor registration method',
    registration
  };
}

export function launchDescriptorRoute(runtime, registration, descriptor, options = {}) {
  const payload = {
    appId: registration.appId,
    panelId: registration.panelId,
    registration,
    descriptor,
    ...options
  };

  if (runtime) {
    for (const methodName of [
      'openDescriptorApp',
      'launchDescriptorApp',
      'openApp',
      'activateApp'
    ]) {
      if (typeof runtime[methodName] === 'function') {
        return {
          launched: true,
          method: methodName,
          result: runtime[methodName](registration.appId, payload)
        };
      }
    }

    for (const methodName of [
      'openPanel',
      'activatePanel',
      'showPanel',
      'selectPanel'
    ]) {
      if (typeof runtime[methodName] === 'function') {
        return {
          launched: true,
          method: methodName,
          result: runtime[methodName](registration.panelId, payload)
        };
      }
    }

    emitEvent(runtime.eventBus, 'panel-change', registration.panelId);
  }

  return {
    launched: false,
    method: 'event',
    panelId: registration.panelId,
    appId: registration.appId
  };
}

export function createDescriptorPanel(descriptor, registration, options = {}) {
  const element = createPanelElement(registration, options);
  const descriptorRuntime = options.descriptorRuntime || null;

  return {
    id: registration.panelId,
    title: registration.title,
    icon: registration.icon,
    descriptorApp: true,
    descriptor,
    registration,
    element,
    component: {
      descriptor,
      registration,
      async render() {
        if (descriptorRuntime && typeof descriptorRuntime.registerDescriptor === 'function') {
          try {
            descriptorRuntime.registerDescriptor(descriptor);
          } catch (error) {
            if (!String(error?.message || '').includes(registration.appId)) {
              throw error;
            }
          }
        }
        if (descriptorRuntime && typeof descriptorRuntime.renderApp === 'function') {
          return descriptorRuntime.renderApp(registration.appId, { contentElement: element });
        }
        element.innerHTML = renderDescriptorPanelHTML(descriptor, registration);
        return element.innerHTML;
      }
    }
  };
}

export function renderVirtualOSDescriptorLauncherHTML(state, options = {}) {
  const registrations = normalizeArray(state.registrations);
  const packs = normalizeArray(state.packs);
  const validationResults = normalizeArray(state.validationResults);
  const warningCount = validationResults.reduce((total, result) => total + normalizeArray(result.warnings).length, 0);

  return `
    <section class="virtual-os-descriptor-shell">
      <header class="virtual-os-descriptor-header">
        <div>
          <h2>SwissKnife Descriptors</h2>
          <p>Loaded ${escapeHTML(String(registrations.length))} descriptor apps from ${escapeHTML(String(packs.length))} packs.</p>
        </div>
        <span class="virtual-os-descriptor-count" data-testid="virtual-os-descriptor-count">${escapeHTML(String(registrations.length))}</span>
      </header>
      ${warningCount > 0 ? `<p class="virtual-os-descriptor-warning" data-testid="virtual-os-descriptor-warning-count">${escapeHTML(String(warningCount))} validation warnings</p>` : ''}
      <div class="virtual-os-descriptor-pack-list">
        ${packs.map((pack) => `
          <article class="virtual-os-descriptor-pack" data-pack-id="${escapeAttribute(pack.id)}">
            <strong>${escapeHTML(pack.id)}</strong>
            <span>${escapeHTML(pack.version)}</span>
            <span>${escapeHTML(pack.source_repository || 'source not declared')}</span>
          </article>
        `).join('')}
      </div>
      <div class="virtual-os-descriptor-app-list">
        ${registrations.length ? registrations.map((registration) => renderRegistrationRow(registration, options)).join('') : '<div class="virtual-os-empty">No SwissKnife descriptor apps loaded.</div>'}
      </div>
    </section>
  `.trim();
}

function renderRegistrationRow(registration, options) {
  return `
    <article class="virtual-os-descriptor-app" data-app-id="${escapeAttribute(registration.appId)}" data-panel-id="${escapeAttribute(registration.panelId)}">
      <div>
        <strong>${escapeHTML(registration.title)}</strong>
        <span>${escapeHTML(registration.appId)}</span>
      </div>
      <div class="virtual-os-descriptor-meta">
        <span>${escapeHTML(registration.component)}</span>
        <span>${escapeHTML(registration.services.join(', ') || 'no services')}</span>
      </div>
      ${options.showLaunchButtons === false ? '' : `<button type="button" data-virtual-os-descriptor-app-id="${escapeAttribute(registration.appId)}">Launch</button>`}
    </article>
  `;
}

function renderDescriptorPanelHTML(descriptor, registration) {
  const regions = normalizeArray(descriptor.ui?.regions);
  const commands = normalizeArray(descriptor.ui?.commands);
  const services = normalizeArray(descriptor.services);
  return `
    <section class="descriptor-app descriptor-app--hallucinate" data-app-id="${escapeAttribute(registration.appId)}">
      <header>
        <h2>${escapeHTML(registration.title)}</h2>
        <p>${escapeHTML(descriptor.meta?.description || '')}</p>
      </header>
      <div class="descriptor-app-summary">
        <span>${escapeHTML(descriptor.ui?.template || 'dashboard')}</span>
        <span>${escapeHTML(descriptor.stateModel?.conflictPolicy || 'last-write-wins')}</span>
      </div>
      <section>
        <h3>Regions</h3>
        ${regions.length ? `<ul>${regions.map((region) => `<li>${escapeHTML(region.name || region.title || region.id || 'Region')}</li>`).join('')}</ul>` : '<p>No regions declared.</p>'}
      </section>
      <section>
        <h3>Commands</h3>
        ${commands.length ? `<ul>${commands.map((command) => `<li>${escapeHTML(command.label || command.action)}</li>`).join('')}</ul>` : '<p>No commands declared.</p>'}
      </section>
      <section>
        <h3>Services</h3>
        ${services.length ? `<ul>${services.map((service) => `<li>${escapeHTML(service.name)}: ${escapeHTML(normalizeStringArray(service.operations).join(', '))}</li>`).join('')}</ul>` : '<p>No services declared.</p>'}
      </section>
    </section>
  `.trim();
}

function validateAppCapabilityDescriptor(descriptor) {
  const errors = [];
  const warnings = [];

  if (!isObject(descriptor)) {
    return { valid: false, errors: [{ path: '', message: 'Descriptor must be an object.' }], warnings };
  }

  if (!isObject(descriptor.meta)) {
    pushIssue(errors, 'meta', 'meta is required.');
  } else {
    requireString(errors, descriptor.meta.id, 'meta.id', 'meta.id is required.');
    requireString(errors, descriptor.meta.name, 'meta.name', 'meta.name is required.');
    if (!isSemver(descriptor.meta.version)) {
      pushIssue(errors, 'meta.version', 'meta.version must be semver.');
    }
  }

  if (descriptor.contractVersion && descriptor.contractVersion !== APP_CAPABILITY_CONTRACT_VERSION) {
    pushIssue(errors, 'contractVersion', `Unsupported contractVersion: ${descriptor.contractVersion}.`);
  }

  if (!Array.isArray(descriptor.lifecycle) || descriptor.lifecycle.length === 0) {
    pushIssue(errors, 'lifecycle', 'lifecycle is required.');
  }

  if (!isObject(descriptor.compatibilityPolicy)) {
    pushIssue(errors, 'compatibilityPolicy', 'compatibilityPolicy is required.');
  }

  validateAppServices(descriptor.services, errors);
  validateAppUI(descriptor.ui, errors, warnings);

  if (!isObject(descriptor.dataContracts)) {
    pushIssue(errors, 'dataContracts', 'dataContracts is required.');
  }

  validateAppActions(descriptor, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function validateAppServices(services, errors) {
  if (!Array.isArray(services) || services.length === 0) {
    pushIssue(errors, 'services', 'services must be a non-empty array.');
    return;
  }

  const serviceNames = new Set();
  services.forEach((service, index) => {
    if (!isObject(service)) {
      pushIssue(errors, `services[${index}]`, 'Service must be an object.');
      return;
    }
    requireString(errors, service.name, `services[${index}].name`, 'Service name is required.');
    if (service.name && serviceNames.has(service.name)) {
      pushIssue(errors, `services[${index}].name`, `Duplicate service name: ${service.name}.`);
    }
    serviceNames.add(service.name);
    if (service.version !== undefined && !isSemver(service.version)) {
      pushIssue(errors, `services[${index}].version`, 'Service version must be semver when provided.');
    }
    if (!Array.isArray(service.operations) || service.operations.length === 0) {
      pushIssue(errors, `services[${index}].operations`, 'Service operations must be a non-empty array.');
    }
  });
}

function validateAppUI(ui, errors, warnings) {
  if (!isObject(ui)) {
    pushIssue(errors, 'ui', 'ui is required.');
    return;
  }
  requireString(errors, ui.template, 'ui.template', 'ui.template is required.');
  if (ui.template && !TEMPLATE_KINDS.has(ui.template)) {
    pushIssue(warnings, 'ui.template', `Unknown UI template: ${ui.template}.`);
  }
  if (!isObject(ui.window)) {
    pushIssue(errors, 'ui.window', 'ui.window is required.');
  }
  if (!Array.isArray(ui.regions)) {
    pushIssue(errors, 'ui.regions', 'ui.regions must be an array.');
  }
  if (ui.commands !== undefined && !Array.isArray(ui.commands)) {
    pushIssue(errors, 'ui.commands', 'ui.commands must be an array when provided.');
  }
}

function validateAppActions(descriptor, errors, warnings) {
  const services = new Set(normalizeArray(descriptor.services).map((service) => service.name));
  const actions = normalizeObject(descriptor.actions);

  Object.entries(actions).forEach(([actionName, action], index) => {
    if (!isObject(action)) {
      pushIssue(errors, `actions.${actionName}`, 'Action must be an object.');
      return;
    }
    if (!services.has(action.service)) {
      pushIssue(errors, `actions.${actionName}.service`, `Action references unknown service: ${String(action.service)}.`);
    }
    requireString(errors, action.operation, `actions.${actionName}.operation`, 'Action operation is required.');
    if (index > 500) {
      pushIssue(warnings, 'actions', 'Descriptor declares more than 500 actions.');
    }
  });

  for (const command of normalizeArray(descriptor.ui?.commands)) {
    if (command?.action && Object.keys(actions).length > 0 && !actions[command.action]) {
      pushIssue(warnings, `ui.commands.${command.action}`, `Command references no action handler: ${command.action}.`);
    }
  }
}

function validateMCPUIProfileDescriptor(descriptor) {
  const errors = [];
  const warnings = [];

  if (!isObject(descriptor)) {
    return { valid: false, errors: [{ path: '', message: 'Descriptor must be an object.' }], warnings };
  }

  requireString(errors, descriptor.name, 'name', 'MCP-IDL descriptor name is required.');
  requireString(errors, descriptor.namespace, 'namespace', 'MCP-IDL descriptor namespace is required.');
  requireString(errors, descriptor.version, 'version', 'MCP-IDL descriptor version is required.');
  if (descriptor.version && !isSemver(descriptor.version)) {
    pushIssue(warnings, 'version', 'MCP-IDL descriptor version should be semver.');
  }

  if (!Array.isArray(descriptor.methods) || descriptor.methods.length === 0) {
    pushIssue(errors, 'methods', 'At least one MCP-IDL method is required.');
  }
  if (!Array.isArray(descriptor.errors)) {
    pushIssue(errors, 'errors', 'MCP-IDL errors array is required.');
  }
  if (!Array.isArray(descriptor.requires)) {
    pushIssue(errors, 'requires', 'MCP-IDL requires array is required.');
  }
  if (!isObject(descriptor.compatibility)) {
    pushIssue(errors, 'compatibility', 'MCP-IDL compatibility metadata is required.');
  }

  validateMCPMeta(descriptor.meta, errors);

  const methodNames = new Set(normalizeArray(descriptor.methods).map((method) => method?.name).filter(Boolean));
  validateMCPServices(descriptor.services, methodNames, errors, warnings);
  validateMCPDataContracts(descriptor.data_contracts, methodNames, errors, warnings);
  validateMCPUI(descriptor.ui, methodNames, errors, warnings);
  validateMCPPermissions(descriptor.permissions, methodNames, errors, warnings);
  validateMCPStateModel(descriptor.state_model, errors);

  return { valid: errors.length === 0, errors, warnings };
}

function validateMCPMeta(meta, errors) {
  if (!isObject(meta)) {
    pushIssue(errors, 'meta', 'UI profile meta section is required.');
    return;
  }
  if (meta.profile !== MCP_UI_PROFILE) {
    pushIssue(errors, 'meta.profile', `Expected ${MCP_UI_PROFILE}.`);
  }
  requireString(errors, meta.profile_version, 'meta.profile_version', 'Profile version is required.');
  requireString(errors, meta.app_id, 'meta.app_id', 'Generated app id is required.');
  requireString(errors, meta.title, 'meta.title', 'Generated app title is required.');
}

function validateMCPServices(services, methodNames, errors, warnings) {
  if (!Array.isArray(services) || services.length === 0) {
    pushIssue(errors, 'services', 'At least one service binding is required.');
    return;
  }

  services.forEach((service, index) => {
    if (!isObject(service)) {
      pushIssue(errors, `services[${index}]`, 'Service must be an object.');
      return;
    }
    requireString(errors, service.id, `services[${index}].id`, 'Service id is required.');
    if (!isNonEmptyString(service.interface_type)) {
      pushIssue(errors, `services[${index}].interface_type`, 'Service interface type is required.');
    } else if (!INTERFACE_TYPES.has(service.interface_type)) {
      pushIssue(errors, `services[${index}].interface_type`, `Unsupported interface type: ${service.interface_type}.`);
    }
    if (!Array.isArray(service.operations) || service.operations.length === 0) {
      pushIssue(errors, `services[${index}].operations`, 'Service operations must be a non-empty array.');
    } else {
      for (const operation of service.operations) {
        if (!methodNames.has(operation)) {
          pushIssue(errors, `services[${index}].operations`, `Unknown service operation: ${String(operation)}.`);
        }
      }
    }
    if (!service.endpoint) {
      pushIssue(warnings, `services[${index}].endpoint`, 'Service endpoint is not declared.');
    }
  });
}

function validateMCPDataContracts(dataContracts, methodNames, errors, warnings) {
  if (!isObject(dataContracts)) {
    pushIssue(errors, 'data_contracts', 'Data contracts section is required.');
    return;
  }
  if (!Array.isArray(dataContracts.operations) || dataContracts.operations.length === 0) {
    pushIssue(errors, 'data_contracts.operations', 'Operation contracts are required.');
    return;
  }

  const seen = new Set();
  dataContracts.operations.forEach((operation, index) => {
    if (!isObject(operation)) {
      pushIssue(errors, `data_contracts.operations[${index}]`, 'Operation contract must be an object.');
      return;
    }
    if (!methodNames.has(operation.method)) {
      pushIssue(errors, `data_contracts.operations[${index}].method`, `Unknown MCP-IDL method: ${String(operation.method)}.`);
      return;
    }
    if (seen.has(operation.method)) {
      pushIssue(errors, `data_contracts.operations[${index}].method`, `Duplicate operation contract: ${operation.method}.`);
    }
    seen.add(operation.method);
    if (!operation.input_schema && !operation.input_schema_cid) {
      pushIssue(errors, `data_contracts.operations[${index}].input_schema`, 'Input schema or CID is required.');
    }
    if (!operation.output_schema && !operation.output_schema_cid) {
      pushIssue(errors, `data_contracts.operations[${index}].output_schema`, 'Output schema or CID is required.');
    }
  });

  for (const methodName of methodNames) {
    if (!seen.has(methodName)) {
      pushIssue(warnings, 'data_contracts.operations', `Method ${methodName} has no UI operation contract.`);
    }
  }
}

function validateMCPUI(ui, methodNames, errors, warnings) {
  if (!isObject(ui)) {
    pushIssue(errors, 'ui', 'UI section is required.');
    return;
  }
  if (!TEMPLATE_KINDS.has(ui.primary_template)) {
    pushIssue(errors, 'ui.primary_template', `Unsupported primary template: ${String(ui.primary_template)}.`);
  }
  if (!Array.isArray(ui.templates) || ui.templates.length === 0) {
    pushIssue(errors, 'ui.templates', 'At least one template mapping is required.');
    return;
  }

  ui.templates.forEach((template, index) => {
    if (!isObject(template)) {
      pushIssue(errors, `ui.templates[${index}]`, 'Template mapping must be an object.');
      return;
    }
    if (!TEMPLATE_KINDS.has(template.kind)) {
      pushIssue(errors, `ui.templates[${index}].kind`, `Unsupported template kind: ${String(template.kind)}.`);
    }
    if (!Array.isArray(template.operations) || template.operations.length === 0) {
      pushIssue(errors, `ui.templates[${index}].operations`, 'Template mapping operations are required.');
      return;
    }
    for (const operation of template.operations) {
      if (!methodNames.has(operation)) {
        pushIssue(errors, `ui.templates[${index}].operations`, `Unknown template operation: ${String(operation)}.`);
      }
    }
  });

  if (!Array.isArray(ui.sections)) {
    pushIssue(warnings, 'ui.sections', 'UI sections are not declared.');
  }
}

function validateMCPPermissions(permissions, methodNames, errors, warnings) {
  if (!isObject(permissions) || !isObject(permissions.operations)) {
    pushIssue(errors, 'permissions.operations', 'Operation capability map is required.');
    return;
  }

  for (const [operation, capabilities] of Object.entries(permissions.operations)) {
    if (!methodNames.has(operation)) {
      pushIssue(errors, `permissions.operations.${operation}`, `Unknown permission operation: ${operation}.`);
    }
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      pushIssue(warnings, `permissions.operations.${operation}`, 'Operation has no required capabilities.');
    }
  }
}

function validateMCPStateModel(stateModel, errors) {
  if (!isObject(stateModel)) {
    pushIssue(errors, 'state_model', 'State model is required.');
    return;
  }
  if (!Array.isArray(stateModel.keys)) {
    pushIssue(errors, 'state_model.keys', 'State model keys must be an array.');
  }
  if (!Array.isArray(stateModel.events)) {
    pushIssue(errors, 'state_model.events', 'State model events must be an array.');
  }
}

function validateBackendBindings(pack, errors, warnings) {
  if (!pack.backend_bindings.length) {
    return;
  }

  const operations = new Set();
  for (const descriptor of pack.descriptors) {
    if (isMCPUIProfileDescriptor(descriptor)) {
      normalizeArray(descriptor.data_contracts?.operations).forEach((operation) => operations.add(operation.method));
    } else {
      normalizeArray(descriptor.services).forEach((service) => {
        normalizeStringArray(service.operations).forEach((operation) => operations.add(operation));
      });
    }
  }

  pack.backend_bindings.forEach((binding, index) => {
    if (!binding.surface) {
      pushIssue(errors, `backend_bindings[${index}].surface`, 'Backend binding surface is required.');
    }
    if (!binding.operation) {
      pushIssue(errors, `backend_bindings[${index}].operation`, 'Backend binding operation is required.');
    } else if (!operations.has(binding.operation)) {
      pushIssue(errors, `backend_bindings[${index}].operation`, `Backend binding references unknown operation: ${binding.operation}.`);
    }
    if (!binding.tool_module || !binding.tool_function) {
      pushIssue(errors, `backend_bindings[${index}]`, 'Backend binding must declare tool_module and tool_function.');
    }
    for (const contract of normalizeStringArray(binding.payload_contracts)) {
      if (!pack.normalized_contracts[contract]) {
        pushIssue(errors, `backend_bindings[${index}].payload_contracts`, `Unknown normalized payload contract: ${contract}.`);
      }
    }
    if (!binding.stream) {
      pushIssue(warnings, `backend_bindings[${index}].stream`, 'Backend binding has no stream contract.');
    }
  });
}

function mcpUIProfileToAppDescriptor(descriptor, context = {}) {
  const operations = normalizeArray(descriptor.data_contracts?.operations);
  const methods = normalizeArray(descriptor.methods);
  const operationByService = new Map();
  for (const service of normalizeArray(descriptor.services)) {
    for (const operation of normalizeStringArray(service.operations)) {
      operationByService.set(operation, service.id);
    }
  }

  const actions = {};
  const commands = operations.map((operation) => {
    const method = operation.method;
    actions[method] = {
      service: operationByService.get(method) || normalizeArray(descriptor.services)[0]?.id || 'default',
      operation: method
    };
    return {
      action: method,
      label: operation.title || titleCase(method)
    };
  });

  const sections = normalizeArray(descriptor.ui?.sections);
  const templateRegions = normalizeArray(descriptor.ui?.templates).flatMap((template) => (
    normalizeArray(template.regions).map((region) => ({
      name: region.title || region.id || titleCase(region.operation || template.kind),
      description: region.operation || template.kind
    }))
  ));
  const regions = sections.length
    ? sections.map((section) => ({
      name: section.title || titleCase(section.id),
      description: section.operation || section.kind || ''
    }))
    : templateRegions;

  const serviceVersion = descriptor.version || descriptor.meta?.profile_version || '0.0.0';
  return {
    contractVersion: APP_CAPABILITY_CONTRACT_VERSION,
    lifecycle: [...DEFAULT_LIFECYCLE],
    compatibilityPolicy: {
      semver: true,
      allowMinorAdditiveOnly: true,
      deprecationsRequired: true
    },
    meta: {
      id: descriptor.meta.app_id,
      name: descriptor.meta.title,
      version: isSemver(serviceVersion) ? serviceVersion : '0.0.0',
      description: descriptor.meta.description || descriptor.description || ''
    },
    services: normalizeArray(descriptor.services).map((service) => ({
      name: service.id,
      version: isSemver(serviceVersion) ? serviceVersion : '0.0.0',
      endpoint: service.endpoint || '',
      operations: normalizeStringArray(service.operations),
      streams: operations
        .filter((operation) => service.operations?.includes(operation.method) && operation.stream?.kind && operation.stream.kind !== 'none')
        .map((operation) => operation.method)
    })),
    ui: {
      template: descriptor.ui.primary_template || 'dashboard',
      window: {
        title: descriptor.meta.title,
        icon: descriptor.meta.icon || 'app',
        singleton: true
      },
      regions,
      commands
    },
    dataContracts: {
      entities: normalizeObject(descriptor.data_contracts?.schemas),
      operations,
      methods
    },
    permissions: Object.values(normalizeObject(descriptor.permissions?.operations)).flatMap((claims) => normalizeStringArray(claims)),
    stateModel: {
      conflictPolicy: descriptor.state_model?.replay ? 'event-replay' : 'last-write-wins',
      keys: normalizeStringArray(descriptor.state_model?.keys),
      events: normalizeStringArray(descriptor.state_model?.events)
    },
    actions,
    metadata: {
      packId: context.packId || null,
      sourceRepository: context.sourceRepository || null,
      descriptorIndex: context.descriptorIndex ?? null,
      sourceDescriptorType: 'mcp-ui-profile',
      namespace: descriptor.namespace
    }
  };
}

function extractDescriptors(pack) {
  if (Array.isArray(pack)) {
    return pack;
  }
  if (!isObject(pack)) {
    return [];
  }
  if (Array.isArray(pack.descriptors)) {
    return pack.descriptors;
  }
  if (Array.isArray(pack.apps)) {
    return pack.apps;
  }
  if (Array.isArray(pack.appDescriptors)) {
    return pack.appDescriptors;
  }
  if (Array.isArray(pack.desktopAppDescriptors)) {
    return pack.desktopAppDescriptors;
  }
  if (looksLikeDescriptor(pack)) {
    return [pack];
  }
  return [];
}

function looksLikeDescriptor(value) {
  return isObject(value) && (
    isObject(value.meta) ||
    Array.isArray(value.methods) ||
    isObject(value.ui)
  );
}

function isMCPUIProfileDescriptor(value) {
  return isObject(value) && (
    value.meta?.profile === MCP_UI_PROFILE ||
    value.meta?.app_id ||
    value.data_contracts ||
    value.state_model
  );
}

function cloneDescriptor(descriptor) {
  return JSON.parse(JSON.stringify(descriptor));
}

function createPanelElement(registration, options) {
  const documentRef = options.document || globalThis.document;
  if (documentRef && typeof documentRef.createElement === 'function') {
    const element = documentRef.createElement('div');
    element.id = `${registration.panelId}-content`;
    return element;
  }
  return {
    id: `${registration.panelId}-content`,
    innerHTML: ''
  };
}

function unwrapDefaultExport(input) {
  if (isObject(input) && input.default) {
    return input.default;
  }
  return input;
}

function pushIssue(target, path, message) {
  target.push({ path, message });
}

function requireString(errors, value, path, message) {
  if (!isNonEmptyString(value)) {
    pushIssue(errors, path, message);
  }
}

function formatValidationErrors(errors) {
  return errors.map((error) => `${error.path}: ${error.message}`).join('; ');
}

function createNoopEventBus() {
  return {
    on() {},
    emit() {}
  };
}

function emitEvent(eventBus, eventName, payload) {
  if (typeof eventBus?.emit === 'function') {
    eventBus.emit(eventName, payload);
    return;
  }
  if (typeof eventBus?.dispatchEvent === 'function' && typeof Event === 'function') {
    const event = new Event(eventName);
    event.detail = payload;
    eventBus.dispatchEvent(event);
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemver(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

function normalizeObject(value) {
  return isObject(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item != null && item !== '').map((item) => String(item))
    : [];
}

function firstString(...values) {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return String(value);
    }
  }
  return '';
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'descriptor-app';
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_/-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

export default VirtualOSDescriptorLauncher;
