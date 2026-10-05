"""
Sprint 1 deliverable: the job-role + skill dataset.

Run directly to (re)seed the database:
    python -m backend.seed_data

Safe to re-run: it upserts, it does not duplicate rows.
"""
from .database import SessionLocal, engine, Base
from .models import Role, Skill, RoleSkill

# name -> category
SKILLS = {
    "Python": "Language", "Java": "Language", "JavaScript": "Language",
    "TypeScript": "Language", "SQL": "Language", "Swift": "Language", "Kotlin": "Language",
    "HTML": "Language", "CSS": "Language",

    "FastAPI": "Framework", "Django": "Framework", "Flask": "Framework",
    "React": "Framework", "Angular": "Framework", "Vue.js": "Framework",
    "Node.js": "Framework", "Spring Boot": "Framework", "Flutter": "Framework",
    "React Native": "Framework",

    "PostgreSQL": "Database", "MongoDB": "Database", "MySQL": "Database", "Redis": "Database",

    "Docker": "DevOps/Cloud", "Kubernetes": "DevOps/Cloud", "AWS": "DevOps/Cloud",
    "Azure": "DevOps/Cloud", "GCP": "DevOps/Cloud", "CI/CD": "DevOps/Cloud",
    "Terraform": "DevOps/Cloud", "Linux": "DevOps/Cloud", "Networking": "DevOps/Cloud",

    "Git": "Tool", "REST APIs": "Tool", "GraphQL": "Tool", "Postman": "Tool",
    "Selenium": "Tool", "Jira": "Tool",

    "Pandas": "Data/ML", "NumPy": "Data/ML", "Scikit-learn": "Data/ML",
    "TensorFlow": "Data/ML", "PyTorch": "Data/ML", "Machine Learning": "Data/ML",
    "NLP": "Data/ML", "Data Visualization": "Data/ML", "Tableau": "Data/ML",
    "Power BI": "Data/ML", "Statistics": "Data/ML",

    "Figma": "Design", "UI/UX Design": "Design", "Wireframing": "Design",

    "Cybersecurity Fundamentals": "Security", "Penetration Testing": "Security",
    "System Design": "Soft/Core", "Agile/Scrum": "Soft/Core",
    "Communication": "Soft/Core", "Problem Solving": "Soft/Core",
    "Data Structures & Algorithms": "Soft/Core",
}

# role title -> (category, description, {skill: importance 1-5})
ROLES = {
    "Backend Developer": (
        "Engineering",
        "Builds and maintains server-side logic, APIs, and databases.",
        {"Python": 5, "SQL": 5, "FastAPI": 4, "Django": 3, "PostgreSQL": 5,
         "REST APIs": 5, "Docker": 4, "Git": 5, "System Design": 4,
         "Data Structures & Algorithms": 4, "Redis": 2, "CI/CD": 3},
    ),
    "Frontend Developer": (
        "Engineering",
        "Builds user-facing interfaces and client-side experiences.",
        {"JavaScript": 5, "TypeScript": 4, "React": 5, "HTML": 5, "CSS": 5,
         "Vue.js": 2, "Git": 5, "REST APIs": 4, "UI/UX Design": 3,
         "Problem Solving": 4, "Figma": 2},
    ),
    "Full Stack Developer": (
        "Engineering",
        "Works across both the frontend UI and backend services.",
        {"JavaScript": 5, "Python": 4, "React": 4, "Node.js": 4, "SQL": 4,
         "PostgreSQL": 4, "REST APIs": 5, "Git": 5, "Docker": 3,
         "System Design": 3, "HTML": 4, "CSS": 4},
    ),
    "Data Scientist": (
        "Data",
        "Extracts insight from data and builds predictive models.",
        {"Python": 5, "Statistics": 5, "Pandas": 5, "NumPy": 4,
         "Scikit-learn": 4, "Machine Learning": 5, "SQL": 4,
         "Data Visualization": 4, "TensorFlow": 3, "Communication": 3},
    ),
    "Machine Learning Engineer": (
        "Data",
        "Designs, trains, and deploys ML models in production.",
        {"Python": 5, "Machine Learning": 5, "TensorFlow": 4, "PyTorch": 4,
         "NLP": 3, "SQL": 3, "Docker": 4, "AWS": 3, "System Design": 3,
         "Data Structures & Algorithms": 3},
    ),
    "DevOps Engineer": (
        "Engineering",
        "Automates infrastructure, deployment pipelines, and reliability.",
        {"Docker": 5, "Kubernetes": 5, "CI/CD": 5, "AWS": 4, "Terraform": 4,
         "Linux": 5, "Networking": 4, "Python": 3, "Git": 4, "System Design": 3},
    ),
    "Cloud Engineer": (
        "Engineering",
        "Designs and manages cloud infrastructure and services.",
        {"AWS": 5, "Azure": 3, "GCP": 3, "Terraform": 4, "Docker": 4,
         "Kubernetes": 3, "Networking": 4, "Linux": 4, "CI/CD": 3, "Python": 3},
    ),
    "Mobile App Developer": (
        "Engineering",
        "Builds native or cross-platform mobile applications.",
        {"Kotlin": 4, "Swift": 3, "Flutter": 4, "React Native": 3,
         "REST APIs": 4, "Git": 4, "UI/UX Design": 3, "Problem Solving": 4},
    ),
    "QA / Test Engineer": (
        "Engineering",
        "Designs and executes tests to ensure software quality.",
        {"Selenium": 5, "Python": 3, "REST APIs": 4, "Jira": 4,
         "SQL": 3, "Git": 3, "Communication": 4, "Problem Solving": 4},
    ),
    "Cybersecurity Analyst": (
        "Security",
        "Protects systems and data from security threats.",
        {"Cybersecurity Fundamentals": 5, "Networking": 5, "Penetration Testing": 4,
         "Linux": 4, "Python": 3, "System Design": 3, "Communication": 3},
    ),
    "UI/UX Designer": (
        "Design",
        "Designs usable, appealing digital product experiences.",
        {"Figma": 5, "UI/UX Design": 5, "Wireframing": 5,
         "Communication": 4, "HTML": 2, "CSS": 2, "Problem Solving": 3},
    ),
    "Data Analyst": (
        "Data",
        "Analyzes data to answer business questions and build reports.",
        {"SQL": 5, "Power BI": 4, "Python": 3, "Data Visualization": 5,
         "Tableau": 4, "Statistics": 4, "Communication": 4, "Pandas": 3},
    ),
}


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Upsert skills
        name_to_skill = {}
        for name, category in SKILLS.items():
            skill = db.query(Skill).filter(Skill.name == name).first()
            if not skill:
                skill = Skill(name=name, category=category)
                db.add(skill)
                db.flush()
            name_to_skill[name] = skill

        # Upsert roles + role_skills
        for title, (category, description, skill_map) in ROLES.items():
            role = db.query(Role).filter(Role.title == title).first()
            if not role:
                role = Role(title=title, category=category, description=description)
                db.add(role)
                db.flush()
            else:
                role.category = category
                role.description = description

            for skill_name, importance in skill_map.items():
                skill = name_to_skill.get(skill_name)
                if not skill:
                    # skill referenced but not declared above - create it generically
                    skill = Skill(name=skill_name, category="Other")
                    db.add(skill)
                    db.flush()
                    name_to_skill[skill_name] = skill

                link = (
                    db.query(RoleSkill)
                    .filter(RoleSkill.role_id == role.id, RoleSkill.skill_id == skill.id)
                    .first()
                )
                if link:
                    link.importance = importance
                else:
                    db.add(RoleSkill(role_id=role.id, skill_id=skill.id, importance=importance))

        db.commit()
        print(f"Seeded {len(ROLES)} roles and {len(SKILLS)} skills.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
