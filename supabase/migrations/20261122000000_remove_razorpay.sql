-- Removes online checkout. Studios pay by UPI, GPay or bank transfer, and an
-- admin records the payment by hand. The old Razorpay migration stays as it
-- was applied; this drops what it added. Existing payment rows keep their
-- 'razorpay' method, so the enum value stays.

drop function if exists public.apply_razorpay_payment(text, text, integer);
drop table if exists public.razorpay_orders;
