1. HRIS Tab: Performance & Evaluation
The new HRIS tab should contain two main functions:
A. Performance Evaluation
•	Used primarily for Probationary Employees. 
•	Evaluation conducted at the employee's 3rd month and 5th month. 
•	Completed by the employee's Immediate Superior/Manager. 
•	HR should be able to monitor completion and view results. 
B. Monthly KPI
•	Used for Regular Employees. 
•	Employee has a defined set of KPIs. 
•	Manager/Immediate Superior records the employee's monthly performance. 
•	KPI results should be stored historically by month. 
•	HR and authorized management can generate reports. 
2. Employee Profile Integration
The system should automatically pull employee information from the existing HRIS employee profile:
•	Employee ID 
•	Employee Name 
•	Department 
•	Position 
•	Branch/Location 
•	Employment Status 
•	Date Hired 
•	Regularization Date 
•	Immediate Superior 
•	Department Head 
•	Employment Type 
The system should automatically determine whether the employee is Probationary or Regular and display the appropriate performance module.
3. Probationary Employee Evaluation
For probationary employees, the system should automatically generate evaluation schedules based on the Date Hired.
Example:
Employee hired: January 10, 2026
Evaluation	Target Date
3rd Month Evaluation	April 10, 2026
5th Month Evaluation	June 10, 2026
The system should automatically notify the Immediate Superior when an evaluation becomes due.
I would also recommend having configurable reminder notifications:
•	7 days before due date 
•	On the due date 
•	Overdue notification after the due date 
HR should have a dashboard showing:
•	Not Yet Due 
•	Upcoming 
•	Due 
•	Completed 
•	Overdue 
4. Probationary Evaluation Form
The evaluation form can contain categories such as:
A. Job Knowledge & Skills
•	Understanding of job responsibilities 
•	Technical Proficiency
•	Continuous Learning
B. Work Quality
•	Accuracy
•	Attention to Detail
•	Timeliness 
•	Efficiency
C. Productivity and Time Management
•	Task Completion
•	Prioritization
•	Proactive Work Habits
D. Communication and Interpersonal Skills
•	Verbal and Written Communication
•	Clarity and Professionalism
•	Listening Skills
E. Reliability and Dependability
•	Punctuality
•	Attendance
•	Dependability
F. Initiative and Problem Solving
•	Problem-Solving
•	Taking Initiative
•	Adaptability
G. Teamwork and Cooperation
•	Collaboration
•	Supportive Attitude
•	Conflict Resolution
H. Attitude and Professionalism
•	Positive Attitude
•	Respect for Policies
•	Workplace Behavior
F. Overall Performance
Each criterion could use a rating scale such as:
Rating	Description
5	Outstanding
4	Exceeds Expectations
3	Meets Expectations
2	Needs Improvement
1	Unsatisfactory
The system should automatically calculate the overall score.
5. Manager Comments
The evaluation should not be purely numerical.
The Immediate Superior should have fields for:
•	Strengths 
•	Areas for Improvement 
•	Development Recommendations 
•	Manager's Overall Comments 
•	Recommendation 
For the 5th-month evaluation, you may also include:
Recommendation:
•	Recommend for Regularization 
•	Do Not Recommend for Regularization 
I would make this configurable rather than hard-coded because the company may eventually change its regularization process.
6. Employee Acknowledgment
After the Manager submits the evaluation:
Manager → HRIS → Employee
The employee should receive a notification that the evaluation is available for review.
The employee can:
•	View evaluation 
•	Acknowledge receipt 
•	Add comments, if applicable 
•	Electronically acknowledge/sign 
Important: the employee's acknowledgment should not automatically mean agreement with the evaluation.
A useful field would be:
"I acknowledge that I have received and reviewed this performance evaluation."
Then separately:
Employee Comments
This creates a better audit trail.
7. Regular Employee — Monthly KPI
For regular employees, I recommend a separate Monthly KPI function.
The KPI should be configurable per:
•	Position 
•	Department 
•	Branch 
•	Employee 
For example, a Branch Manager might have:
KPI	Weight
Sales Target	30%
Customer Satisfaction	20%
Attendance/Manpower Management	15%
Inventory Accuracy	15%
Operational Compliance	10%
Team Performance	10%
Total	100%
The IT system should allow HR/Admin to create and modify KPI templates without requiring a developer every time a KPI changes.
8. KPI Configuration
I strongly recommend making the KPI system template-based.
For example:
KPI Template: Barista
•	Sales 
•	Customer Service 
•	Product Quality 
•	Attendance 
•	Store Cleanliness 
•	SOP Compliance 
KPI Template: HR Staff
•	Recruitment Completion 
•	Employee Records Accuracy 
•	Payroll Support 
•	Employee Relations 
•	Attendance Monitoring 
•	HR Reports 
The Immediate Superior can then assign the appropriate KPI template to an employee.
9. Monthly KPI Workflow
The monthly process could work like this:
Step 1 — KPI Assignment
HR/Admin creates or assigns the KPI template.
Step 2 — Monthly Measurement
Manager enters the employee's actual performance.
Example:
KPI: Sales Target
Target: ₱500,000
Actual: ₱525,000
Achievement: 105%
Step 3 — Automatic Calculation
The system calculates the KPI score based on the configured formula.
Step 4 — Manager Review
Manager adds comments regarding the employee's performance.
Step 5 — Submission
Manager submits the monthly KPI.
Step 6 — Employee Review
Employee can view the results and acknowledge them.
Step 7 — HR Monitoring
HR can see completion and performance trends.
10. Performance Dashboard
I think this would be particularly useful for HR.
The dashboard could show:
Company Level
•	Total Employees 
•	Employees with Completed Evaluations 
•	Pending Evaluations 
•	Overdue Evaluations 
•	Average Performance Score 
Probationary
•	Employees approaching 3rd-month evaluation 
•	3rd-month evaluations completed 
•	Employees approaching 5th-month evaluation 
•	5th-month evaluations completed 
•	Employees recommended for regularization 
•	Employees needing improvement 
Regular Employees
•	Monthly KPI completion rate 
•	Average KPI score 
•	Employees below target 
•	Employees exceeding target 
•	Department performance 
•	Branch performance 
11. Performance History
Every evaluation should remain available in the employee's HRIS profile.
For example:
Employee Performance History
Date	Type	Evaluator	Score	Status
Apr 10, 2026	3rd Month	Manager A	3.8/5	Completed
Jun 10, 2026	5th Month	Manager A	4.2/5	Completed
Jul 2026	Monthly KPI	Manager A	91%	Completed
Aug 2026	Monthly KPI	Manager A	95%	Completed
This will be valuable later for promotions, salary reviews, regularization, performance improvement plans, and employee relations.
12. User Permissions
This is important for IT.
Employee
•	View own evaluations 
•	View own KPI 
•	Acknowledge evaluation 
•	Submit comments 
Immediate Superior/Manager
•	View employees under their supervision 
•	Complete evaluations 
•	Submit monthly KPIs 
•	View performance history of direct reports 
Department Head
•	View employees within department 
•	View manager evaluations 
•	Review department performance 
HR
•	View all employees 
•	Create evaluation templates 
•	Create KPI templates 
•	Configure evaluation schedules 
•	Monitor completion 
•	Generate reports 
•	Edit/reopen evaluations where authorized 
System Administrator
•	Manage system configuration and access permissions 
Managers should not be able to view evaluations of employees who are not under their authorized reporting structure.
13. Audit Trail
I would specifically ask IT to include an audit trail.
The system should record:
•	Who created the evaluation 
•	Who edited it 
•	Date/time of edits 
•	Who submitted it 
•	Who acknowledged it 
•	Date/time of acknowledgment 
•	Whether the evaluation was reopened 
•	Who reopened it 
•	Previous and revised scores, where applicable 
This is especially important for HR records.
14. Notifications
The HRIS should generate notifications for:
Manager
•	Upcoming evaluation 
•	Evaluation due 
•	Evaluation overdue 
•	Employee KPI pending 
Employee
•	Evaluation available for review 
•	Evaluation submitted 
•	KPI available 
•	Manager comments added 
HR
•	Evaluation overdue 
•	3rd/5th month evaluation pending 
•	Monthly KPI completion report 
•	Employees with consistently low scores 
Notifications could eventually be sent through the HRIS, email, or both.

