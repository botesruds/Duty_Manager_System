// Hand-written DB types matching supabase/migrations/.
// Regenerate with `supabase gen types typescript --linked > src/lib/database.types.ts`
// after wiring up the Supabase CLI; the shape below matches what the generator produces.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type DutyType = 'break' | 'lunch_a' | 'lunch_b'
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'

export const DUTY_TYPE_LABEL: Record<DutyType, string> = {
  break: 'Break',
  lunch_a: 'Lunch A',
  lunch_b: 'Lunch B',
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          staff_id: string | null
          is_admin: boolean
          is_monitor: boolean
          created_at: string
        }
        Insert: {
          id: string
          staff_id?: string | null
          is_admin?: boolean
          is_monitor?: boolean
          created_at?: string
        }
        Update: { staff_id?: string | null; is_admin?: boolean; is_monitor?: boolean }
        Relationships: []
      }
      departments: {
        Row: {
          id: string
          name: string
          duty_quota_break: number
          duty_quota_lunch: number
        }
        Insert: {
          id?: string
          name: string
          duty_quota_break?: number
          duty_quota_lunch?: number
        }
        Update: {
          name?: string
          duty_quota_break?: number
          duty_quota_lunch?: number
        }
        Relationships: []
      }
      staff: {
        Row: {
          id: string
          emp_no: string
          name: string
          department_id: string | null
          duty_quota_break: number | null
          duty_quota_lunch: number | null
          must_change_password: boolean
          created_at: string
        }
        Insert: {
          id?: string
          emp_no: string
          name: string
          department_id?: string | null
          duty_quota_break?: number | null
          duty_quota_lunch?: number | null
          must_change_password?: boolean
          created_at?: string
        }
        Update: {
          emp_no?: string
          name?: string
          department_id?: string | null
          duty_quota_break?: number | null
          duty_quota_lunch?: number | null
          must_change_password?: boolean
        }
        Relationships: []
      }
      duty_slots: {
        Row: {
          id: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          capacity: number
          created_at: string
        }
        Insert: {
          id?: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          capacity: number
          created_at?: string
        }
        Update: {
          duty_type?: DutyType
          day_of_week?: DayOfWeek
          capacity?: number
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          staff_id: string
          duty_slot_id: string
          booked_at: string
          location_id: string | null
        }
        Insert: {
          id?: string
          staff_id: string
          duty_slot_id: string
          booked_at?: string
          location_id?: string | null
        }
        Update: { staff_id?: string; duty_slot_id?: string; location_id?: string | null }
        Relationships: []
      }
      locations: {
        Row: { id: string; name: string; category: 'indoor' | 'outdoor'; created_at: string }
        Insert: { id?: string; name: string; category?: 'indoor' | 'outdoor'; created_at?: string }
        Update: { name?: string; category?: 'indoor' | 'outdoor' }
        Relationships: []
      }
      attendance_records: {
        Row: {
          id: string
          booking_id: string
          date: string
          self_marked_at: string | null
          self_marked_by_staff_id: string | null
          monitor_marked_at: string | null
          monitor_marked_by_staff_id: string | null
        }
        Insert: {
          id?: string
          booking_id: string
          date?: string
          self_marked_at?: string | null
          self_marked_by_staff_id?: string | null
          monitor_marked_at?: string | null
          monitor_marked_by_staff_id?: string | null
        }
        Update: {
          self_marked_at?: string | null
          self_marked_by_staff_id?: string | null
          monitor_marked_at?: string | null
          monitor_marked_by_staff_id?: string | null
        }
        Relationships: []
      }
      swap_requests: {
        Row: {
          id: string
          requester_staff_id: string
          source_booking_id: string
          target_day: DayOfWeek | null
          status: 'open' | 'completed' | 'cancelled'
          matched_with_request_id: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          requester_staff_id: string
          source_booking_id: string
          target_day?: DayOfWeek | null
          status?: 'open' | 'completed' | 'cancelled'
          matched_with_request_id?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          status?: 'open' | 'completed' | 'cancelled'
          matched_with_request_id?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          booking_window_open: boolean
          schedule_published: boolean
          current_season: 'indoor' | 'outdoor'
          updated_at: string
        }
        Insert: {
          id?: number
          booking_window_open?: boolean
          schedule_published?: boolean
          current_season?: 'indoor' | 'outdoor'
          updated_at?: string
        }
        Update: {
          booking_window_open?: boolean
          schedule_published?: boolean
          current_season?: 'indoor' | 'outdoor'
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_monitor: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      current_staff_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      effective_quota: {
        Args: { p_staff_id: string; p_duty_type: DutyType }
        Returns: number
      }
      book_slot: {
        Args: { p_slot_id: string }
        Returns: string
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      mark_attendance: {
        Args: { p_booking_id: string; p_by_monitor: boolean }
        Returns: string
      }
      complete_password_change: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_browsable_slots: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          capacity: number
          spots_taken: number
          already_booked: boolean
        }[]
      }
      todays_duties: {
        Args: Record<PropertyKey, never>
        Returns: {
          booking_id: string
          slot_id: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          location_name: string | null
          staff_id: string
          emp_no: string
          staff_name: string
          self_marked_at: string | null
          self_marked_by_staff_id: string | null
          monitor_marked_at: string | null
          monitor_marked_by_staff_id: string | null
          monitor_name: string | null
        }[]
      }
      my_todays_duties: {
        Args: Record<PropertyKey, never>
        Returns: {
          booking_id: string
          slot_id: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          location_name: string | null
          self_marked_at: string | null
          monitor_marked_at: string | null
          monitor_name: string | null
        }[]
      }
      my_schedule: {
        Args: Record<PropertyKey, never>
        Returns: {
          booking_id: string
          day_of_week: DayOfWeek
          duty_type: DutyType
          location_name: string | null
        }[]
      }
      assign_booking_to_location: {
        Args: { p_booking_id: string; p_location_id: string }
        Returns: undefined
      }
      unassign_booking_location: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      schedule_day_locations: {
        Args: { p_day: DayOfWeek }
        Returns: {
          duty_slot_id: string
          duty_type: DutyType
          location_id: string
          location_name: string
          capacity: number
        }[]
      }
      schedule_day_bookings: {
        Args: { p_day: DayOfWeek }
        Returns: {
          booking_id: string
          duty_slot_id: string
          duty_type: DutyType
          staff_id: string
          staff_name: string
          emp_no: string
          location_id: string | null
        }[]
      }
      master_schedule: {
        Args: Record<PropertyKey, never>
        Returns: {
          duty_slot_id: string
          duty_type: DutyType
          day_of_week: DayOfWeek
          location_id: string
          location_name: string
          booking_id: string | null
          staff_id: string | null
          staff_name: string | null
          emp_no: string | null
        }[]
      }
      create_swap_request: {
        Args: { p_source_booking_id: string; p_target_day: DayOfWeek | null }
        Returns: { request_id: string; matched: boolean }[]
      }
      cancel_swap_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      take_swap_request: {
        Args: { p_request_id: string; p_taker_booking_id: string }
        Returns: undefined
      }
      list_swap_board: {
        Args: Record<PropertyKey, never>
        Returns: {
          request_id: string
          requester_staff_id: string
          requester_name: string
          requester_emp_no: string
          source_booking_id: string
          source_day: DayOfWeek
          source_duty_type: DutyType
          target_day: DayOfWeek | null
          created_at: string
        }[]
      }
      eligible_takes_for: {
        Args: { p_request_id: string }
        Returns: {
          booking_id: string
          day_of_week: DayOfWeek
          duty_type: DutyType
          location_name: string | null
        }[]
      }
      actionable_swap_requests: {
        Args: Record<PropertyKey, never>
        Returns: {
          request_id: string
          requester_name: string
          source_day: DayOfWeek
          source_duty_type: DutyType
          target_day: DayOfWeek | null
          created_at: string
        }[]
      }
      my_swap_requests: {
        Args: Record<PropertyKey, never>
        Returns: {
          request_id: string
          status: 'open' | 'completed' | 'cancelled'
          source_booking_id: string
          source_day: DayOfWeek
          source_duty_type: DutyType
          target_day: DayOfWeek | null
          matched_with_request_id: string | null
          created_at: string
          completed_at: string | null
        }[]
      }
      my_recent_swaps: {
        Args: Record<PropertyKey, never>
        Returns: {
          completed_at: string
          gave_day: DayOfWeek
          gave_type: DutyType
          got_day: DayOfWeek
          got_type: DutyType
          with_name: string
        }[]
      }
      admin_recent_swaps: {
        Args: Record<PropertyKey, never>
        Returns: {
          completed_at: string
          teacher_a: string
          a_day: DayOfWeek
          a_type: DutyType
          teacher_b: string
          b_day: DayOfWeek
          b_type: DutyType
        }[]
      }
    }
    Enums: {
      duty_type: DutyType
      day_of_week: DayOfWeek
    }
    CompositeTypes: { [_ in never]: never }
  }
}
