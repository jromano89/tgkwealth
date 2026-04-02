function investorApp() {
  const preferredAdvisorId = String(window.TGK_CONFIG?.advisorId || '').trim();

  return {
    ...createBrandingState(),
    ...createEnvelopeModalHelpers(),
    tab: 'overview',
    advisors: [],
    assignedAdvisor: null,
    customers: [],
    selectedClientId: null,
    selectedClient: null,
    accounts: [],
    envelopes: [],
    sidebarCollapsed: false,
    loading: true,
    assetTransferWorkflowId: window.TGK_DEMO?.config?.assetTransferWorkflowId || window.TGK_CONFIG?.workflows?.assetTransferId || '',
    tasks: [],
    showTaskWorkflow: false,
    taskWorkflowTask: null,
    taskWorkflowInstanceUrl: '',
    taskWorkflowError: null,
    taskWorkflowLoading: false,
    taskWorkflowLoadingIndex: 0,
    taskWorkflowLoadingTimer: null,

    async init() {
      this.initializeBrandingState();
      try {
        const [advisors, customers] = await Promise.all([
          TGK_API.getEmployees(),
          TGK_API.getCustomers()
        ]);
        this.advisors = advisors;
        this.assignedAdvisor = this.advisors.find((advisor) => advisor.id === preferredAdvisorId) || this.advisors[0] || null;
        this.customers = this.sortCustomers(customers);
        this.setTab('overview');
        const preferredClientId = TGK_API.getPreferredCustomerId();
        const initialClient = this.customers.find((customer) => customer.id === preferredClientId) || this.customers[0];
        if (initialClient) {
          this.selectedClientId = initialClient.id;
          await this.loadClient();
        }
      } catch (e) {
        console.error('Failed to load:', e);
      }
      this.loading = false;
      TGK_API.scheduleDocusignWarmup();
    },

    sortCustomers(customers) {
      return [...(customers || [])].sort((a, b) => {
        const left = `${a.first_name || ''} ${a.last_name || ''}`.trim();
        const right = `${b.first_name || ''} ${b.last_name || ''}`.trim();
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
      });
    },

    setTab(nextTab) {
      const allowedTabs = new Set(['overview', 'documents', 'tasks', 'settings']);
      this.tab = allowedTabs.has(nextTab) ? nextTab : 'overview';
    },

    async loadClient() {
      if (!this.selectedClientId) return;
      try {
        const detail = await TGK_API.getCustomer(this.selectedClientId);
        this.selectedClient = detail;
        TGK_API.setPreferredCustomerId(detail.id);
        this.accounts = detail.accounts || [];
        this.envelopes = detail.envelopes || [];
        this.tasks = detail.tasks || [];
        this.assignedAdvisor = this.advisors.find((advisor) => advisor.id === detail.employee_id)
          || this.advisors.find((advisor) => advisor.id === preferredAdvisorId)
          || this.advisors[0]
          || null;
      } catch (e) {
        console.error('Failed to load client:', e);
        this.selectedClient = null;
        this.accounts = [];
        this.envelopes = [];
        this.tasks = [];
      }
    },

    async switchClient() {
      await this.loadClient();
    },

    get clientName() {
      return this.selectedClient ? `${this.selectedClient.first_name} ${this.selectedClient.last_name}` : '';
    },

    get portfolioDateLabel() {
      return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(new Date());
    },

    get totalPortfolioValue() {
      return this.accounts.reduce((sum, a) => sum + (a.metadata?.value || 0), 0);
    },

    get ytdReturn() {
      const portfolioValue = this.totalPortfolioValue;
      if (this.accounts.length === 0 || portfolioValue === 0) return 0;
      const total = this.accounts.reduce((sum, a) => sum + ((a.metadata?.ytdReturn || 0) * (a.metadata?.value || 0)), 0);
      return total / portfolioValue;
    },

    async dismissTask(id) {
      try {
        const nextTasks = this.tasks.filter((task) => task.id !== id);
        await TGK_API.deleteTask(id);
        this.tasks = nextTasks;
        if (this.selectedClient) {
          this.selectedClient = {
            ...this.selectedClient,
            tasks: nextTasks
          };
        }
      } catch (e) {
        console.error('Failed to dismiss task:', e);
      }
    },

    taskCanLaunchWorkflow(task) {
      return String(task?.data?.workflow || '').trim().toLowerCase() === 'asset-transfer';
    },

    handleTaskClick(task) {
      if (!this.taskCanLaunchWorkflow(task)) {
        return;
      }

      this.openTaskWorkflow(task);
    },

    warmTaskWorkflow() {
      return TGK_API.warmDocusignExperience();
    },

    getTaskWorkflowId(task) {
      return String(
        task?.data?.workflowId
        || task?.data?.workflow_id
        || this.assetTransferWorkflowId
        || ''
      ).trim();
    },

    getTaskWorkflowLaunchUrl(task) {
      return String(
        task?.data?.instanceUrl
        || task?.data?.instance_url
        || task?.data?.maestroInstanceUrl
        || ''
      ).trim();
    },

    getTaskWorkflowCustomerId(task) {
      return String(
        task?.customer_id
        || task?.customerId
        || task?.data?.customerId
        || task?.data?.customer_id
        || this.selectedClient?.id
        || this.selectedClientId
        || ''
      ).trim();
    },

    getTaskWorkflowCustomerName(task) {
      return String(
        task?.data?.customerName
        || task?.data?.customer_name
        || this.selectedClient?.name
        || [this.selectedClient?.first_name, this.selectedClient?.last_name].filter(Boolean).join(' ')
        || ''
      ).trim();
    },

    getTaskWorkflowCustomerEmail(task) {
      return String(
        task?.data?.customerEmail
        || task?.data?.customer_email
        || this.selectedClient?.email
        || ''
      ).trim();
    },

    getTaskWorkflowTriggerInputs(task) {
      const triggerInputs = task?.data?.triggerInputs || task?.data?.trigger_inputs;
      const payload = triggerInputs && typeof triggerInputs === 'object' && !Array.isArray(triggerInputs)
        ? { ...triggerInputs }
        : {};
      const customerId = this.getTaskWorkflowCustomerId(task);
      const customerName = this.getTaskWorkflowCustomerName(task);
      const customerEmail = this.getTaskWorkflowCustomerEmail(task);

      if (customerId) {
        payload.customerId = customerId;
      }
      if (customerName) {
        payload.customerName = customerName;
      }
      if (customerEmail) {
        payload.customerEmail = customerEmail;
      }

      payload.appSlug = window.TGK_CONFIG?.appSlug;
      payload.idv = window.TGK_DEMO?.config?.assetTransferIdVerification ? 'true' : 'false';

      return payload;
    },

    persistTaskWorkflowLaunchUrl(task, instanceUrl) {
      if (!task?.id || !instanceUrl) {
        return;
      }

      void TGK_API.updateTask(task.id, {
        data: {
          instanceUrl
        }
      })
        .then((savedTask) => {
          this.tasks = this.tasks.map((item) => (item.id === savedTask.id ? savedTask : item));

          if (this.selectedClient) {
            this.selectedClient = {
              ...this.selectedClient,
              tasks: (this.selectedClient.tasks || []).map((item) => (item.id === savedTask.id ? savedTask : item))
            };
          }

          if (this.taskWorkflowTask?.id === savedTask.id) {
            this.taskWorkflowTask = savedTask;
          }
        })
        .catch((error) => {
          console.warn('Failed to persist asset transfer launch URL:', error);
        });
    },

    resetTaskWorkflowState() {
      this.showTaskWorkflow = false;
      this.taskWorkflowTask = null;
      this.taskWorkflowInstanceUrl = '';
      this.taskWorkflowError = null;
      this.taskWorkflowLoading = false;
      this.stopTaskWorkflowLoading();
    },

    async openTaskWorkflow(task) {
      this.resetTaskWorkflowState();
      this.showTaskWorkflow = true;
      this.taskWorkflowTask = task || null;
      this.warmTaskWorkflow();
      await this.loadTaskWorkflow(task);
    },

    closeTaskWorkflow() {
      this.resetTaskWorkflowState();
    },

    startTaskWorkflowLoading() {
      this.stopTaskWorkflowLoading();
      this.taskWorkflowLoadingIndex = 0;
      this.taskWorkflowLoadingTimer = window.setInterval(() => {
        this.taskWorkflowLoadingIndex = Math.min(
          this.taskWorkflowLoadingIndex + 1,
          this.taskWorkflowLoadingSteps.length - 1
        );
      }, 1400);
    },

    stopTaskWorkflowLoading() {
      if (this.taskWorkflowLoadingTimer) {
        window.clearInterval(this.taskWorkflowLoadingTimer);
        this.taskWorkflowLoadingTimer = null;
      }
    },

    get taskWorkflowLoadingSteps() {
      return [
        'Connecting to Docusign IAM',
        'Preparing asset transfer',
        'Launching the embedded experience'
      ];
    },

    async loadTaskWorkflow(task) {
      this.taskWorkflowLoading = true;
      this.taskWorkflowError = null;
      this.taskWorkflowInstanceUrl = '';
      this.startTaskWorkflowLoading();

      try {
        const existingInstanceUrl = this.getTaskWorkflowLaunchUrl(task);
        if (existingInstanceUrl) {
          this.taskWorkflowInstanceUrl = existingInstanceUrl;
          return;
        }

        const workflowId = this.getTaskWorkflowId(task);
        if (!workflowId) {
          throw new Error('No asset transfer workflow is configured.');
        }

        const result = await TGK_API.triggerMaestroWorkflow(workflowId, {
          instance_name: `TGK Wealth Asset Transfer ${this.clientName || task?.title || ''} ${new Date().toISOString()}`.trim(),
          trigger_inputs: this.getTaskWorkflowTriggerInputs(task)
        });

        if (!result?.instance_url) {
          throw new Error('Docusign IAM did not return a launch URL.');
        }

        this.taskWorkflowInstanceUrl = result.instance_url;
        this.persistTaskWorkflowLaunchUrl(task, result.instance_url);
      } catch (e) {
        console.error('Failed to load asset transfer workflow:', e);
        this.taskWorkflowError = e.message || 'Failed to launch asset transfer.';
      } finally {
        this.taskWorkflowLoading = false;
        this.stopTaskWorkflowLoading();
      }
    },

  };
}
