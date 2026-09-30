// App-wide toast: any page calls showToast(); the root layout renders it.
export const toast = $state<{ message: string | null }>({ message: null });

export const showToast = (message: string) => (toast.message = message);
