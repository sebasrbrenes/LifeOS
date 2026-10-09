export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_insights: {
        Row: {
          content: Json;
          created_at: string;
          id: string;
          model: string;
          payload: Json;
          user_id: string;
          week_start: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          id?: string;
          model: string;
          payload: Json;
          user_id?: string;
          week_start: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          id?: string;
          model?: string;
          payload?: Json;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_insights_user_id_week_start_fkey";
            columns: ["user_id", "week_start"];
            isOneToOne: false;
            referencedRelation: "weekly_reviews";
            referencedColumns: ["user_id", "week_start"];
          },
        ];
      };
      goal_milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          goal_id: string;
          id: string;
          name: string;
          position: number;
          score_value: number;
          target_value: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          goal_id: string;
          id?: string;
          name: string;
          position?: number;
          score_value: number;
          target_value?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          goal_id?: string;
          id?: string;
          name?: string;
          position?: number;
          score_value?: number;
          target_value?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_milestones_user_id_goal_id_fkey";
            columns: ["user_id", "goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      goals: {
        Row: {
          category_id: string | null;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          id: string;
          priority: number;
          status: string;
          target_date: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          priority?: number;
          status?: string;
          target_date?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          category_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          priority?: number;
          status?: string;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_user_id_category_id_fkey";
            columns: ["user_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "score_categories";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      integrations: {
        Row: {
          created_at: string;
          id: string;
          last_error: string | null;
          last_success_at: string | null;
          last_synced_at: string | null;
          provider: string;
          provider_user_id: string | null;
          scopes: Json;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_success_at?: string | null;
          last_synced_at?: string | null;
          provider: string;
          provider_user_id?: string | null;
          scopes?: Json;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_error?: string | null;
          last_success_at?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          provider_user_id?: string | null;
          scopes?: Json;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      metric_definitions: {
        Row: {
          aggregation: string;
          category_id: string;
          config: Json;
          created_at: string;
          description: string | null;
          direction: string;
          enabled: boolean;
          id: string;
          key: string;
          name: string;
          period: string;
          position: number;
          source_filter: Json;
          source_metric: string | null;
          source_preference: string;
          unit: string | null;
          updated_at: string;
          user_id: string;
          weight: number;
        };
        Insert: {
          aggregation: string;
          category_id: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          direction: string;
          enabled?: boolean;
          id?: string;
          key: string;
          name: string;
          period: string;
          position?: number;
          source_filter?: Json;
          source_metric?: string | null;
          source_preference?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          weight?: number;
        };
        Update: {
          aggregation?: string;
          category_id?: string;
          config?: Json;
          created_at?: string;
          description?: string | null;
          direction?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          name?: string;
          period?: string;
          position?: number;
          source_filter?: Json;
          source_metric?: string | null;
          source_preference?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "metric_definitions_user_id_category_id_fkey";
            columns: ["user_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "score_categories";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      metric_events: {
        Row: {
          confidence: number;
          created_at: string;
          external_record_id: string | null;
          id: string;
          metadata: Json;
          metric_definition_id: string;
          note: string | null;
          occurred_at: string;
          source: string;
          unit: string | null;
          updated_at: string;
          user_id: string;
          value_json: Json | null;
          value_numeric: number | null;
          value_text: string | null;
        };
        Insert: {
          confidence?: number;
          created_at?: string;
          external_record_id?: string | null;
          id?: string;
          metadata?: Json;
          metric_definition_id: string;
          note?: string | null;
          occurred_at: string;
          source?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          value_json?: Json | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Update: {
          confidence?: number;
          created_at?: string;
          external_record_id?: string | null;
          id?: string;
          metadata?: Json;
          metric_definition_id?: string;
          note?: string | null;
          occurred_at?: string;
          source?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          value_json?: Json | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "metric_events_user_id_metric_definition_id_fkey";
            columns: ["user_id", "metric_definition_id"];
            isOneToOne: false;
            referencedRelation: "metric_definitions";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      oauth_credentials: {
        Row: {
          created_at: string;
          encrypted_access_token: string;
          encrypted_refresh_token: string | null;
          expires_at: string | null;
          id: string;
          integration_id: string;
          token_type: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          encrypted_access_token: string;
          encrypted_refresh_token?: string | null;
          expires_at?: string | null;
          id?: string;
          integration_id: string;
          token_type?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          encrypted_access_token?: string;
          encrypted_refresh_token?: string | null;
          expires_at?: string | null;
          id?: string;
          integration_id?: string;
          token_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_credentials_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: true;
            referencedRelation: "integrations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          currency: string;
          date_of_birth: string | null;
          display_name: string | null;
          id: string;
          primary_goal_id: string | null;
          timezone: string;
          unit_system: string;
          updated_at: string;
          user_id: string;
          week_starts_on: number;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          date_of_birth?: string | null;
          display_name?: string | null;
          id?: string;
          primary_goal_id?: string | null;
          timezone?: string;
          unit_system?: string;
          updated_at?: string;
          user_id: string;
          week_starts_on?: number;
        };
        Update: {
          created_at?: string;
          currency?: string;
          date_of_birth?: string | null;
          display_name?: string | null;
          id?: string;
          primary_goal_id?: string | null;
          timezone?: string;
          unit_system?: string;
          updated_at?: string;
          user_id?: string;
          week_starts_on?: number;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_primary_goal_fkey";
            columns: ["user_id", "primary_goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      score_categories: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          name: string;
          position: number;
          updated_at: string;
          user_id: string;
          weight: number;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          name: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
          weight: number;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          name?: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
          weight?: number;
        };
        Relationships: [];
      };
      score_snapshots: {
        Row: {
          category_scores: Json;
          created_at: string;
          id: string;
          life_score: number | null;
          metric_scores: Json;
          score_version_id: string;
          snapshot_date: string;
          user_id: string;
          week_score: number | null;
        };
        Insert: {
          category_scores?: Json;
          created_at?: string;
          id?: string;
          life_score?: number | null;
          metric_scores?: Json;
          score_version_id: string;
          snapshot_date: string;
          user_id?: string;
          week_score?: number | null;
        };
        Update: {
          category_scores?: Json;
          created_at?: string;
          id?: string;
          life_score?: number | null;
          metric_scores?: Json;
          score_version_id?: string;
          snapshot_date?: string;
          user_id?: string;
          week_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "score_snapshots_user_id_score_version_id_fkey";
            columns: ["user_id", "score_version_id"];
            isOneToOne: false;
            referencedRelation: "score_versions";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      score_versions: {
        Row: {
          configuration: Json;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          name: string;
          user_id: string;
          version: number;
        };
        Insert: {
          configuration: Json;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          name: string;
          user_id?: string;
          version: number;
        };
        Update: {
          configuration?: Json;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          name?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          error_code: string | null;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          integration_id: string;
          metadata: Json;
          records_created: number;
          records_received: number;
          records_updated: number;
          started_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          integration_id: string;
          metadata?: Json;
          records_created?: number;
          records_received?: number;
          records_updated?: number;
          started_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          error_code?: string | null;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          integration_id?: string;
          metadata?: Json;
          records_created?: number;
          records_received?: number;
          records_updated?: number;
          started_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_runs_user_id_integration_id_fkey";
            columns: ["user_id", "integration_id"];
            isOneToOne: false;
            referencedRelation: "integrations";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      weekly_commitments: {
        Row: {
          actual_value: number;
          category_id: string | null;
          completion_type: string;
          created_at: string;
          id: string;
          position: number;
          status: string;
          target_value: number;
          title: string;
          unit: string | null;
          updated_at: string;
          user_id: string;
          week_start: string;
          weight: number;
        };
        Insert: {
          actual_value?: number;
          category_id?: string | null;
          completion_type?: string;
          created_at?: string;
          id?: string;
          position?: number;
          status?: string;
          target_value: number;
          title: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start: string;
          weight?: number;
        };
        Update: {
          actual_value?: number;
          category_id?: string | null;
          completion_type?: string;
          created_at?: string;
          id?: string;
          position?: number;
          status?: string;
          target_value?: number;
          title?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_commitments_user_id_category_id_fkey";
            columns: ["user_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "score_categories";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
      weekly_reviews: {
        Row: {
          created_at: string;
          id: string;
          life_score_end: number | null;
          life_score_start: number | null;
          score_version_id: string | null;
          summary: Json;
          updated_at: string;
          user_id: string;
          user_notes: string | null;
          week_end: string;
          week_score: number | null;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          life_score_end?: number | null;
          life_score_start?: number | null;
          score_version_id?: string | null;
          summary?: Json;
          updated_at?: string;
          user_id?: string;
          user_notes?: string | null;
          week_end: string;
          week_score?: number | null;
          week_start: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          life_score_end?: number | null;
          life_score_start?: number | null;
          score_version_id?: string | null;
          summary?: Json;
          updated_at?: string;
          user_id?: string;
          user_notes?: string | null;
          week_end?: string;
          week_score?: number | null;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_score_version_id_fkey";
            columns: ["user_id", "score_version_id"];
            isOneToOne: false;
            referencedRelation: "score_versions";
            referencedColumns: ["user_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      close_week: {
        Args: {
          p_life_score_end: number;
          p_life_score_start: number;
          p_score_version_id: string;
          p_summary: Json;
          p_user_notes: string;
          p_week_score: number;
          p_week_start: string;
        };
        Returns: {
          created_at: string;
          id: string;
          life_score_end: number | null;
          life_score_start: number | null;
          score_version_id: string | null;
          summary: Json;
          updated_at: string;
          user_id: string;
          user_notes: string | null;
          week_end: string;
          week_score: number | null;
          week_start: string;
        };
        SetofOptions: {
          from: "*";
          to: "weekly_reviews";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_score_version: {
        Args: { p_configuration: Json };
        Returns: {
          configuration: Json;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          name: string;
          user_id: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "score_versions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_category_settings: {
        Args: { p_categories: Json };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
