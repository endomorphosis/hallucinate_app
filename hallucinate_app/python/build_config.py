import shutil
import os
# Backup master.toml
shutil.copy("master.toml", ".master.toml.bak")

# Concatenate config files into master.toml
config_files = os.listdir("./config")
with open("master.toml", "w") as master_file:
    for file_name in config_files:
        file_path = os.path.join("./config", file_name)
        with open(file_path, "r") as config_file:
            master_file.write(config_file.read())

# Backup worker/requirements.txt
shutil.copy("./worker/requirements.txt", "./worker/.requirements.txt.bak")

# Concatenate worker requirements files into worker/requirements.txt
requirements_files = os.listdir("./worker/requirements")
with open("./worker/requirements.txt", "w") as worker_requirements_file:
    for file_name in requirements_files:
        file_path = os.path.join("./worker/requirements", file_name)
        with open(file_path, "r") as requirements_file:
            worker_requirements_file.write(requirements_file.read())
