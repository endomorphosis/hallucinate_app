/**
 * Notification System
 * 
 * Toast-style notification system for dashboard interfaces
 * Provides success, error, warning, and info notifications
 */

export default class NotificationSystem {
  /**
   * Create a new notification system
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.options = {
      container: document.body,
      position: 'top-right',
      duration: 5000,
      maxVisible: 5,
      ...options
    };
    
    this.notifications = [];
    this.container = null;
    
    this.initializeContainer();
  }
  
  /**
   * Initialize the notification container
   */
  initializeContainer() {
    // Return if container already exists
    if (this.container) return;
    
    // Create container element
    this.container = document.createElement('div');
    this.container.className = `notifications-container ${this.options.position}`;
    
    // Add CSS styles if necessary
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = this.getStyles();
      document.head.appendChild(style);
    }
    
    // Add container to DOM
    this.options.container.appendChild(this.container);
  }
  
  /**
   * Show a notification
   * @param {string} message Notification message
   * @param {string} type Notification type
   * @param {Object} options Additional options
   * @returns {string} Notification ID
   */
  show(message, type = 'info', options = {}) {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.id = id;
    
    // Determine icon based on type
    let icon = 'info-circle';
    let title = 'Information';
    
    switch (type) {
      case 'success':
        icon = 'check-circle';
        title = 'Success';
        break;
      case 'error':
        icon = 'exclamation-circle';
        title = 'Error';
        break;
      case 'warning':
        icon = 'exclamation-triangle';
        title = 'Warning';
        break;
    }
    
    // Set notification content
    notification.innerHTML = `
      <div class="notification-icon">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-title">${options.title || title}</div>
        <div class="notification-message">${message}</div>
      </div>
      <button class="notification-close">
        <i class="fas fa-times"></i>
      </button>
      <div class="notification-progress"></div>
    `;
    
    // Add close handler
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
      this.closeNotification(id);
    });
    
    // Limit notifications
    if (this.notifications.length >= this.options.maxVisible) {
      this.closeNotification(this.notifications[0]);
    }
    
    // Add notification to DOM
    this.container.appendChild(notification);
    this.notifications.push(id);
    
    // Set timeout to auto-close
    const duration = options.duration || this.options.duration;
    const timeout = setTimeout(() => {
      this.closeNotification(id);
    }, duration);
    
    // Store timeout reference
    notification.dataset.timeout = timeout;
    
    return id;
  }
  
  /**
   * Show a success notification
   * @param {string} message Notification message
   * @param {Object} options Additional options
   * @returns {string} Notification ID
   */
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }
  
  /**
   * Show an error notification
   * @param {string} message Notification message
   * @param {Object} options Additional options
   * @returns {string} Notification ID
   */
  error(message, options = {}) {
    return this.show(message, 'error', options);
  }
  
  /**
   * Show a warning notification
   * @param {string} message Notification message
   * @param {Object} options Additional options
   * @returns {string} Notification ID
   */
  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }
  
  /**
   * Show an info notification
   * @param {string} message Notification message
   * @param {Object} options Additional options
   * @returns {string} Notification ID
   */
  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
  
  /**
   * Close a notification
   * @param {string} id Notification ID
   */
  closeNotification(id) {
    const notification = document.getElementById(id);
    if (!notification) return;
    
    // Clear timeout
    if (notification.dataset.timeout) {
      clearTimeout(parseInt(notification.dataset.timeout));
    }
    
    // Add closing animation
    notification.classList.add('closing');
    
    // Remove notification after animation
    setTimeout(() => {
      notification.remove();
      this.notifications = this.notifications.filter(notifId => notifId !== id);
    }, 300);
  }
  
  /**
   * Clear all notifications
   */
  clearAll() {
    while (this.notifications.length > 0) {
      this.closeNotification(this.notifications[0]);
    }
  }
  
  /**
   * Get notification styles
   * @returns {string} CSS styles
   */
  getStyles() {
    return `
      .notifications-container {
        position: fixed;
        z-index: 1000;
        max-width: 350px;
      }
      
      .notifications-container.top-left {
        top: 20px;
        left: 20px;
      }
      
      .notifications-container.top-right {
        top: 20px;
        right: 20px;
      }
      
      .notifications-container.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      
      .notifications-container.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      
      .notification {
        background-color: #ffffff;
        color: #111827;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        margin-bottom: 10px;
        padding: 16px;
        display: flex;
        align-items: flex-start;
        position: relative;
        overflow: hidden;
        animation: notification-enter 0.3s ease-out forwards;
      }
      
      .notification.closing {
        animation: notification-exit 0.3s ease-out forwards;
      }
      
      .notification-icon {
        flex-shrink: 0;
        margin-right: 12px;
        font-size: 18px;
      }
      
      .notification-content {
        flex: 1;
      }
      
      .notification-title {
        font-weight: 600;
        margin-bottom: 4px;
      }
      
      .notification-message {
        font-size: 14px;
        color: #6b7280;
      }
      
      .notification-close {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 0;
        position: absolute;
        top: 12px;
        right: 12px;
        font-size: 14px;
      }
      
      .notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        width: 100%;
        animation: notification-progress 5s linear forwards;
      }
      
      .notification.success .notification-icon {
        color: #10b981;
      }
      
      .notification.success .notification-progress {
        background-color: #10b981;
      }
      
      .notification.error .notification-icon {
        color: #ef4444;
      }
      
      .notification.error .notification-progress {
        background-color: #ef4444;
      }
      
      .notification.warning .notification-icon {
        color: #f59e0b;
      }
      
      .notification.warning .notification-progress {
        background-color: #f59e0b;
      }
      
      .notification.info .notification-icon {
        color: #3b82f6;
      }
      
      .notification.info .notification-progress {
        background-color: #3b82f6;
      }
      
      @keyframes notification-enter {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @keyframes notification-exit {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
      
      @keyframes notification-progress {
        from {
          width: 100%;
        }
        to {
          width: 0;
        }
      }
      
      @media (prefers-color-scheme: dark) {
        .notification {
          background-color: #1f2937;
          color: #f9fafb;
        }
        
        .notification-message {
          color: #d1d5db;
        }
      }
    `;
  }
}