from setuptools import setup, find_packages

setup(
    name="ucan_auth_py",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "pynacl>=1.4.0",
        "pyjwt>=2.3.0",
        "cryptography>=36.0.0",
    ],
    description="UCAN (User Controlled Authorization Networks) implementation in Python",
    author="hallucinate_app",
)
