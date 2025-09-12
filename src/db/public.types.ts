export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      account_users: {
        Row: {
          account_id: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          role: string
          user_id: string
        }
        Update: {
          account_id?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invited_by"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          cloudbuild_repository: string | null
          created_at: string | null
          default_bucket_id: string | null
          id: string
          is_active: boolean | null
          name: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          cloudbuild_repository?: string | null
          created_at?: string | null
          default_bucket_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          cloudbuild_repository?: string | null
          created_at?: string | null
          default_bucket_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bot_instances: {
        Row: {
          account_id: string
          bot_id: string
          cli: string
          created_at: string
          enabled: boolean
          env: Json | null
          id: string
          image: string
          managed_projects: string
          model: string
          name: string
          preset: string
          role: string
          updated_at: string
        }
        Insert: {
          account_id: string
          bot_id: string
          cli?: string
          created_at?: string
          enabled?: boolean
          env?: Json | null
          id: string
          image?: string
          managed_projects?: string
          model?: string
          name?: string
          preset?: string
          role?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          bot_id?: string
          cli?: string
          created_at?: string
          enabled?: boolean
          env?: Json | null
          id?: string
          image?: string
          managed_projects?: string
          model?: string
          name?: string
          preset?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_instances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_instances_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_instances_role_account_id_fkey"
            columns: ["role", "account_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      bot_settings: {
        Row: {
          account_id: string
          allow_delegation: number
          channel_verbosity: number
          created_at: string
          delegated_verbosity: number
          dm_verbosity: number
          instance_id: string
          mount_bot_instances: number
          updated_at: string
        }
        Insert: {
          account_id: string
          allow_delegation?: number
          channel_verbosity?: number
          created_at?: string
          delegated_verbosity?: number
          dm_verbosity?: number
          instance_id?: string
          mount_bot_instances?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          allow_delegation?: number
          channel_verbosity?: number
          created_at?: string
          delegated_verbosity?: number
          dm_verbosity?: number
          instance_id?: string
          mount_bot_instances?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "botsettings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          account_id: string
          active: boolean
          created_at: string
          discord_bot_token: string
          id: string
          name: string
          public: boolean
        }
        Insert: {
          account_id: string
          active: boolean
          created_at?: string
          discord_bot_token?: string
          id?: string
          name: string
          public: boolean
        }
        Update: {
          account_id?: string
          active?: boolean
          created_at?: string
          discord_bot_token?: string
          id?: string
          name?: string
          public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      buckets: {
        Row: {
          account_id: string
          bucket_name: string
          created_at: string
          id: string
        }
        Insert: {
          account_id: string
          bucket_name: string
          created_at?: string
          id?: string
        }
        Update: {
          account_id?: string
          bucket_name?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nuckets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          account_id: string
          channel_id: string
          created_at: string | null
          guild_id: string | null
          id: string
          is_active: boolean | null
          type: string
        }
        Insert: {
          account_id: string
          channel_id: string
          created_at?: string | null
          guild_id?: string | null
          id?: string
          is_active?: boolean | null
          type: string
        }
        Update: {
          account_id?: string
          channel_id?: string
          created_at?: string | null
          guild_id?: string | null
          id?: string
          is_active?: boolean | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      container_image_files: {
        Row: {
          account_id: string
          container_name: string
          created_at: string
          data: string | null
          filename: string
          id: string
          public: boolean
          role: string
          text: string | null
        }
        Insert: {
          account_id: string
          container_name: string
          created_at?: string
          data?: string | null
          filename: string
          id?: string
          public?: boolean
          role?: string
          text?: string | null
        }
        Update: {
          account_id?: string
          container_name?: string
          created_at?: string
          data?: string | null
          filename?: string
          id?: string
          public?: boolean
          role?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "container_files_account_id_container_name_fkey"
            columns: ["account_id", "container_name"]
            isOneToOne: false
            referencedRelation: "container_images"
            referencedColumns: ["account_id", "name"]
          },
          {
            foreignKeyName: "container_files_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      container_images: {
        Row: {
          account_id: string
          cli: string
          created_at: string
          description: string
          dockerfile: string | null
          id: string
          name: string
          public: boolean
        }
        Insert: {
          account_id: string
          cli?: string
          created_at?: string
          description?: string
          dockerfile?: string | null
          id?: string
          name?: string
          public?: boolean
        }
        Update: {
          account_id?: string
          cli?: string
          created_at?: string
          description?: string
          dockerfile?: string | null
          id?: string
          name?: string
          public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "containers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      environments: {
        Row: {
          account_id: string
          build_status: string | null
          created_at: string
          deployment_status: string | null
          id: string
          image_name: string | null
          last_build_at: string | null
          last_deployment_at: string | null
          name: string
          project_id: string
          service_name: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          build_status?: string | null
          created_at?: string
          deployment_status?: string | null
          id?: string
          image_name?: string | null
          last_build_at?: string | null
          last_deployment_at?: string | null
          name: string
          project_id: string
          service_name?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          build_status?: string | null
          created_at?: string
          deployment_status?: string | null
          id?: string
          image_name?: string | null
          last_build_at?: string | null
          last_deployment_at?: string | null
          name?: string
          project_id?: string
          service_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "environments_project_id_account_id_fkey"
            columns: ["project_id", "account_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      git_keys: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          name: string
          private_key: string | null
          public_key: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id: string
          name?: string
          private_key?: string | null
          public_key?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          name?: string
          private_key?: string | null
          public_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "git_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          account_id: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: string
          token: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          category: string
          context_window: number
          cost_per_1k_tokens: number | null
          created_at: string | null
          description: string | null
          display_name: string
          frequency_penalty: number | null
          id: string
          is_active: boolean | null
          max_tokens: number
          model_name: string
          name: string
          presence_penalty: number | null
          provider: string
          supported_parameters: Json | null
          temperature: number | null
          top_p: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          context_window: number
          cost_per_1k_tokens?: number | null
          created_at?: string | null
          description?: string | null
          display_name: string
          frequency_penalty?: number | null
          id: string
          is_active?: boolean | null
          max_tokens: number
          model_name: string
          name: string
          presence_penalty?: number | null
          provider: string
          supported_parameters?: Json | null
          temperature?: number | null
          top_p?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          context_window?: number
          cost_per_1k_tokens?: number | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          frequency_penalty?: number | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number
          model_name?: string
          name?: string
          presence_penalty?: number | null
          provider?: string
          supported_parameters?: Json | null
          temperature?: number | null
          top_p?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mounts: {
        Row: {
          account_id: string
          bucket_id: string
          bucket_path: string
          container_path: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          account_id: string
          bucket_id: string
          bucket_path?: string
          container_path: string
          created_at?: string
          id?: string
          role?: string
        }
        Update: {
          account_id?: string
          bucket_id?: string
          bucket_path?: string
          container_path?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mounts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          created_at: string | null
          id: string
          name: string
          preset: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
          preset: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          preset?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          account_id: string
          assigned_qa: string | null
          branch: string
          created_at: string
          description: string
          discord_channel_ids: string
          git_key_id: string
          id: string
          name: string
          repository_url: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_qa?: string | null
          branch?: string
          created_at?: string
          description?: string
          discord_channel_ids?: string
          git_key_id?: string
          id?: string
          name?: string
          repository_url?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_qa?: string | null
          branch?: string
          created_at?: string
          description?: string
          discord_channel_ids?: string
          git_key_id?: string
          id?: string
          name?: string
          repository_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_account_id_git_key_id_fkey"
            columns: ["account_id", "git_key_id"]
            isOneToOne: false
            referencedRelation: "git_keys"
            referencedColumns: ["account_id", "id"]
          },
          {
            foreignKeyName: "projects_assigned_qa_account_id_fkey"
            columns: ["assigned_qa", "account_id"]
            isOneToOne: false
            referencedRelation: "bot_instances"
            referencedColumns: ["id", "account_id"]
          },
        ]
      }
      roles: {
        Row: {
          account_id: string
          allow_delegation: number
          channel_verbosity: number | null
          created_at: string | null
          delegated_verbosity: number | null
          description: string | null
          dm_verbosity: number | null
          id: string
          md: string | null
          mount_bot_instances: number
          name: string | null
          public: boolean
          updated_at: string | null
        }
        Insert: {
          account_id: string
          allow_delegation?: number
          channel_verbosity?: number | null
          created_at?: string | null
          delegated_verbosity?: number | null
          description?: string | null
          dm_verbosity?: number | null
          id?: string
          md?: string | null
          mount_bot_instances?: number
          name?: string | null
          public?: boolean
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          allow_delegation?: number
          channel_verbosity?: number | null
          created_at?: string | null
          delegated_verbosity?: number | null
          description?: string | null
          dm_verbosity?: number | null
          id?: string
          md?: string | null
          mount_bot_instances?: number
          name?: string | null
          public?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      secrets: {
        Row: {
          account_id: string
          created_at: string
          environment_id: string
          id: string
          project_id: string
          secrets_value: string
        }
        Insert: {
          account_id: string
          created_at?: string
          environment_id: string
          id?: string
          project_id: string
          secrets_value?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          environment_id?: string
          id?: string
          project_id?: string
          secrets_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "secrets_environment_id_fkey"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "environments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_accounts: {
        Row: {
          account_id: string
          auth_provider_x509_cert_url: string
          auth_uri: string
          client_email: string
          client_id: string
          client_x509_cert_url: string
          created_at: string
          id: string
          private_key: string
          private_key_id: string
          project_id: string
          token_uri: string
          type: string
          universe_domain: string
        }
        Insert: {
          account_id: string
          auth_provider_x509_cert_url?: string
          auth_uri?: string
          client_email: string
          client_id: string
          client_x509_cert_url?: string
          created_at?: string
          id?: string
          private_key: string
          private_key_id: string
          project_id?: string
          token_uri?: string
          type?: string
          universe_domain?: string
        }
        Update: {
          account_id?: string
          auth_provider_x509_cert_url?: string
          auth_uri?: string
          client_email?: string
          client_id?: string
          client_x509_cert_url?: string
          created_at?: string
          id?: string
          private_key?: string
          private_key_id?: string
          project_id?: string
          token_uri?: string
          type?: string
          universe_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          account_id: string
          channel_verbosity: number | null
          created_at: string | null
          delegated_verbosity: number | null
          dm_verbosity: number | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          channel_verbosity?: number | null
          created_at?: string | null
          delegated_verbosity?: number | null
          dm_verbosity?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          channel_verbosity?: number | null
          created_at?: string | null
          delegated_verbosity?: number | null
          dm_verbosity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      stored_usage_records: {
        Row: {
          completion_tokens: number
          cost: number
          id: string
          instance_id: string
          model: string
          prompt_tokens: number
          timestamp: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens: number
          cost: number
          id?: string
          instance_id: string
          model: string
          prompt_tokens: number
          timestamp?: string
          total_tokens: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          cost?: number
          id?: string
          instance_id?: string
          model?: string
          prompt_tokens?: number
          timestamp?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          description: string | null
          id: string
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          description?: string | null
          id?: string
          timestamp?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          description?: string | null
          id?: string
          timestamp?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_authorizations: {
        Row: {
          account_id: string
          authorized_identifier: string
          created_at: string
          id: string
          is_active: boolean
          type: string
          user_id: string
        }
        Insert: {
          account_id: string
          authorized_identifier: string
          created_at?: string
          id?: string
          is_active?: boolean
          type: string
          user_id: string
        }
        Update: {
          account_id?: string
          authorized_identifier?: string
          created_at?: string
          id?: string
          is_active?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_authorizations_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_users"
            referencedColumns: ["account_id", "user_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          balance: number
          created_at: string
          email: string
          id: string
          last_login_at: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          email: string
          id: string
          last_login_at?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          is_active: boolean | null
          last_login: string | null
          provider: string
          provider_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created: string
          email: string
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          created?: string
          email: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created?: string
          email?: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      workflows: {
        Row: {
          account_id: string
          created_at: string
          description: string
          id: string
          name: string
          public: boolean
          workflow: string
        }
        Insert: {
          account_id?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          public?: boolean
          workflow: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          public?: boolean
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_accounts_for_user: {
        Args: { user_id: string }
        Returns: string[]
      }
      get_user_account_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_account_admin: {
        Args: { p_account_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
