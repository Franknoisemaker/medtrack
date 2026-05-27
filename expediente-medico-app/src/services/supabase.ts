// Centralized Supabase client using CDN global injection to ensure sandbox portability

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-id.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const globalSupabase = (window as any).supabase;

// Robust chainable query builder mock for offline/sandbox database queries
class MockQueryBuilder implements PromiseLike<any> {
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }

  select() { return this; }
  insert() { return Promise.resolve({ data: null, error: null }); }
  update() { return Promise.resolve({ data: null, error: null }); }
  delete() { return Promise.resolve({ data: null, error: null }); }
  eq() { return this; }
  neq() { return this; }
  gt() { return this; }
  gte() { return this; }
  lt() { return this; }
  lte() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { return Promise.resolve({ data: null, error: null }); }
  maybeSingle() { return Promise.resolve({ data: null, error: null }); }
}

export const supabase = globalSupabase
  ? globalSupabase.createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signUp: async ({ email, password, options }: any) => {
          console.warn('Sandbox: Utilizando registro simulado de Supabase.');
          const mockUser = {
            id: 'mock-doctor-uuid-123456',
            email: email || 'medico@medtrack.mx',
            user_metadata: options?.data || { nombre: 'Dr. MedTrack Local', cedula: '12345678' }
          };
          const mockSession = {
            user: mockUser,
            access_token: 'mock-jwt-token-123456'
          };
          return { data: { user: mockUser, session: mockSession }, error: null };
        },
        signInWithPassword: async ({ email }: any) => {
          console.warn('Sandbox: Utilizando inicio de sesión simulado de Supabase.');
          const mockUser = {
            id: 'mock-doctor-uuid-123456',
            email: email || 'medico@medtrack.mx',
            user_metadata: { nombre: 'Dr. MedTrack Local', cedula: '12345678' }
          };
          const mockSession = {
            user: mockUser,
            access_token: 'mock-jwt-token-123456'
          };
          return { data: { user: mockUser, session: mockSession }, error: null };
        },
        signOut: async () => {
          console.warn('Sandbox: Utilizando cierre de sesión simulado de Supabase.');
          return { error: null };
        }
      },
      from: () => new MockQueryBuilder(),
      rpc: (method: string, params?: any) => {
        console.warn(`Sandbox: RPC '${method}' invocado con:`, params);
        if (method === 'get_decrypted_medico') {
          return Promise.resolve({
            data: [{
              id: params?.p_medico_id || 'mock-doctor-uuid-123456',
              nombre: 'Dr. MedTrack Local',
              cedula: '12345678',
              email: 'medico@medtrack.mx'
            }],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };

