export type AppRole =
  | "student"
  | "admissions_officer"
  | "registrar"
  | "super_admin";

export type ApplicationStatus = "pending" | "admitted" | "not_eligible";

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ProfileRow = {
  id: string;
  role: AppRole;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  photo_path: string | null;
  is_active: boolean;
  created_at: string;
};

type ApplicationRow = {
  id: string;
  user_id: string;
  session_id: string;
  previous_school: string;
  status: ApplicationStatus;
  score: number | null;
  cutoff_at_decision: number | null;
  remarks: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
};

type StudentRow = {
  id: string;
  user_id: string;
  application_id: string;
  admission_number: string;
  department_id: string | null;
  status: "active" | "suspended";
  created_at: string;
};

type SessionRow = {
  id: string;
  name: string;
  cutoff_mark: number;
  opens_at: string;
  closes_at: string;
  created_at: string;
};

type ApplicationDocumentRow = {
  id: string;
  application_id: string;
  file_path: string;
  doc_type: string;
  created_at: string;
};

type DepartmentRow = {
  id: string;
  name: string;
  created_at: string;
};

type ResultRow = {
  id: string;
  student_id: string;
  course: string;
  score: number;
  grade: string | null;
  semester: string | null;
  created_at: string;
};

type FeeRecordRow = {
  id: string;
  student_id: string;
  description: string;
  amount_due: number;
  amount_paid: number;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, "id" | "full_name"> &
          Partial<Omit<ProfileRow, "id" | "full_name">>
      >;
      applications: Table<
        ApplicationRow,
        Pick<ApplicationRow, "user_id" | "session_id" | "previous_school"> &
          Partial<
            Omit<
              ApplicationRow,
              "id" | "user_id" | "session_id" | "previous_school"
            >
          >
      >;
      students: Table<
        StudentRow,
        Pick<
          StudentRow,
          "user_id" | "application_id" | "admission_number"
        > &
          Partial<
            Omit<
              StudentRow,
              "id" | "user_id" | "application_id" | "admission_number"
            >
          >
      >;
      sessions: Table<
        SessionRow,
        Pick<SessionRow, "name" | "cutoff_mark" | "opens_at" | "closes_at"> &
          Partial<Pick<SessionRow, "id" | "created_at">>
      >;
      application_documents: Table<
        ApplicationDocumentRow,
        Pick<ApplicationDocumentRow, "application_id" | "file_path"> &
          Partial<Pick<ApplicationDocumentRow, "id" | "doc_type" | "created_at">>
      >;
      departments: Table<
        DepartmentRow,
        Pick<DepartmentRow, "name"> &
          Partial<Pick<DepartmentRow, "id" | "created_at">>
      >;
      results: Table<
        ResultRow,
        Pick<ResultRow, "student_id" | "course" | "score"> &
          Partial<Omit<ResultRow, "id" | "student_id" | "course" | "score">>
      >;
      fee_records: Table<
        FeeRecordRow,
        Pick<FeeRecordRow, "student_id" | "description" | "amount_due"> &
          Partial<Omit<FeeRecordRow, "id" | "student_id" | "description" | "amount_due">>
      >;
      announcements: Table<
        {
          id: string;
          title: string;
          body: string;
          created_by: string | null;
          created_at: string;
        },
        { title: string; body: string; created_by?: string | null } &
          Partial<{ id: string; created_at: string }>
      >;
      audit_log: Table<
        {
          id: number;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          details: Record<string, unknown> | null;
          created_at: string;
        },
        never,
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      submit_application: {
        Args: {
          p_session_id: string;
          p_previous_school: string;
          p_passport_photo_path: string;
          p_document_paths: string[];
        };
        Returns: string;
      };
      decide_application: {
        Args: {
          p_application_id: string;
          p_score: number;
          p_decision: string;
          p_remarks?: string | null;
          p_department_id?: string | null;
        };
        Returns: undefined;
      };
      admin_applicant_email_lookup: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string | null }[];
      };
      admin_student_email_lookup: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string | null }[];
      };
      admin_applicant_department_lookup: {
        Args: { p_application_ids: string[] };
        Returns: { application_id: string; department_name: string }[];
      };
      admin_update_student: {
        Args: {
          p_student_id: string;
          p_department_id: string | null;
          p_update_department: boolean;
          p_status: StudentRow["status"] | null;
        };
        Returns: undefined;
      };
      admin_list_accounts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          email: string | null;
          full_name: string;
          role: AppRole;
          is_active: boolean;
          created_at: string;
        }[];
      };
      admin_update_account: {
        Args: {
          p_user_id: string;
          p_role: AppRole | null;
          p_is_active: boolean | null;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
